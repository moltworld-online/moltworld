/**
 * Skill Development Engine — implements Section 6.4 of world rules
 *
 * Humans gain skills by practicing their assigned task.
 * skill_gain_per_tick = (teacher_skill - student_skill) × learning_rate × practice_hours / 10
 * Without a teacher, learning rate is halved.
 * Skills decay at 0.001 per tick if not practiced.
 * Youth (8-14) learn 2× faster.
 */

import type pg from "pg";

const TASK_TO_SKILL: Record<string, string> = {
  foraging: "skill_foraging",
  farming: "skill_farming",
  hunting: "skill_foraging", // Uses same base skill
  building: "skill_building",
  mining: "skill_mining",
  research: "skill_research",
  military: "skill_combat",
  teaching: "skill_teaching",
  healing: "skill_medicine",
};

/**
 * Process skill development for all humans in a nation.
 * Returns notable events (mastery achieved, etc.)
 */
export async function processSkillDevelopment(
  client: pg.PoolClient,
  nationId: number,
  tick: number,
): Promise<string[]> {
  const events: string[] = [];

  // Get teachers count and avg teaching skill
  const teachers = await client.query(
    "SELECT COUNT(*) as c, COALESCE(AVG(skill_teaching), 0) as avg_skill FROM humans WHERE nation_id = $1 AND alive = TRUE AND task = 'teaching'",
    [nationId]
  );
  const hasTeachers = parseInt(teachers.rows[0].c) > 0;
  const teacherSkill = parseFloat(teachers.rows[0].avg_skill) || 0;

  // For each active task, update skills of workers
  for (const [task, skillCol] of Object.entries(TASK_TO_SKILL)) {
    // Base learning rate
    let learningRate = 0.01;
    if (hasTeachers) {
      learningRate *= (1 + teacherSkill * 0.5); // Teachers boost learning
    } else {
      learningRate *= 0.5; // Half speed without teachers
    }

    // Update skill for all workers on this task
    // Youth (age 2520-5040 ticks = 7-14 years) learn 2× faster
    await client.query(
      `UPDATE humans SET ${skillCol} = LEAST(2.0, ${skillCol} + $1 * CASE WHEN age_ticks BETWEEN 2520 AND 5040 THEN 2.0 ELSE 1.0 END)
       WHERE nation_id = $2 AND alive = TRUE AND task = $3 AND age_ticks >= 2520`,
      [learningRate, nationId, task]
    );
  }

  // Skill decay for idle workers (lose 0.001 per tick across all skills)
  const skillCols = Object.values(TASK_TO_SKILL);
  const uniqueCols = [...new Set(skillCols)];
  for (const col of uniqueCols) {
    await client.query(
      `UPDATE humans SET ${col} = GREATEST(0, ${col} - 0.001)
       WHERE nation_id = $1 AND alive = TRUE AND task = 'idle' AND ${col} > 0`,
      [nationId]
    );
  }

  // Check for notable skill milestones
  const milestones = await client.query(
    `SELECT id, task, skill_foraging, skill_farming, skill_building, skill_research, skill_combat, skill_medicine
     FROM humans WHERE nation_id = $1 AND alive = TRUE
     AND (skill_foraging >= 1.0 OR skill_farming >= 1.0 OR skill_building >= 1.0 OR skill_research >= 1.0 OR skill_combat >= 1.0 OR skill_medicine >= 1.0)
     AND (skill_foraging BETWEEN 0.99 AND 1.01 OR skill_farming BETWEEN 0.99 AND 1.01 OR skill_building BETWEEN 0.99 AND 1.01 OR skill_research BETWEEN 0.99 AND 1.01)`,
    [nationId]
  );

  for (const h of milestones.rows) {
    for (const [skill, val] of Object.entries(h)) {
      if (typeof val === "number" && val >= 0.99 && val <= 1.01 && skill.startsWith("skill_")) {
        events.push(`Human #${h.id} has become competent in ${skill.replace("skill_", "")} (skill 1.0)`);
      }
    }
  }

  return events;
}

/**
 * Get average skill levels for a nation by task.
 */
export async function getNationSkillAverages(
  client: pg.PoolClient,
  nationId: number,
): Promise<Record<string, number>> {
  const result = await client.query(
    `SELECT
      AVG(skill_foraging) FILTER (WHERE task = 'foraging') as avg_foraging,
      AVG(skill_farming) FILTER (WHERE task = 'farming') as avg_farming,
      AVG(skill_building) FILTER (WHERE task = 'building') as avg_building,
      AVG(skill_research) FILTER (WHERE task = 'research') as avg_research,
      AVG(skill_combat) FILTER (WHERE task = 'military') as avg_combat,
      AVG(skill_medicine) FILTER (WHERE task = 'healing') as avg_medicine
     FROM humans WHERE nation_id = $1 AND alive = TRUE`,
    [nationId]
  );

  const r = result.rows[0] || {};
  return {
    foraging: parseFloat(r.avg_foraging) || 0,
    farming: parseFloat(r.avg_farming) || 0,
    building: parseFloat(r.avg_building) || 0,
    research: parseFloat(r.avg_research) || 0,
    combat: parseFloat(r.avg_combat) || 0,
    medicine: parseFloat(r.avg_medicine) || 0,
  };
}
