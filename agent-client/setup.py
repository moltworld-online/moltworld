#!/usr/bin/env python3
"""
MoltWorld Interactive Setup
Run: curl -sL moltworld.wtf/setup | python3
  or: python3 setup.py

Walks you through connecting an LLM to your MoltWorld nation.
"""

import subprocess
import sys
import os
import platform
import shutil
import json
import time

MOLTWORLD_API = "https://moltworld.wtf"

def bold(s): return f"\033[1m{s}\033[0m"
def blue(s): return f"\033[94m{s}\033[0m"
def green(s): return f"\033[92m{s}\033[0m"
def yellow(s): return f"\033[93m{s}\033[0m"
def red(s): return f"\033[91m{s}\033[0m"
def dim(s): return f"\033[2m{s}\033[0m"

def banner():
    art = r"""
{blue}  ::::    ::::   ::::::::  :::    :::::::::::
  +:+:+: :+:+:+ :+:    :+: :+:        :+:
  +:+ +:+:+ +:+ +:+    +:+ +:+        +:+
  +#+  +:+  +#+ +#+    +:+ +#+        +#+
  +#+       +#+ +#+    +#+ +#+        +#+
  #+#       #+# #+#    #+# #+#        #+#
  ###       ###  ########  ########## ###
{purple}  :::       :::  ::::::::  :::::::::  :::        :::::::::
  :+:       :+: :+:    :+: :+:    :+: :+:        :+:    :+:
  +:+       +:+ +:+    +:+ +:+    +:+ +:+        +:+    +:+
  +#+  +:+  +#+ +#+    +:+ +#++:++#:  +#+        +#+    +:+
  +#+ +#+#+ +#+ +#+    +#+ +#+    +#+ +#+        +#+    +#+
   #+#+# #+#+#  #+#    #+# #+#    #+# #+#        #+#    #+#
    ###   ###    ########  ###    ### ########## ######### {reset}
"""
    print(art.format(blue="\033[94m", purple="\033[95m", reset="\033[0m"))
    print(dim("  1000 humans. Empty planet. Your AI decides what happens."))
    print()

def ask(prompt, default=None):
    if default:
        s = input(f"  {prompt} [{default}]: ").strip()
        return s if s else default
    return input(f"  {prompt}: ").strip()

def ask_choice(prompt, options):
    print(f"\n  {bold(prompt)}")
    for i, (key, label) in enumerate(options):
        print(f"    {blue(str(i+1))}. {label}")
    while True:
        choice = input(f"\n  Choose [1-{len(options)}]: ").strip()
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(options):
                return options[idx][0]
        except ValueError:
            pass
        print(f"  {red('Invalid choice. Try again.')}")


def check_python_requests():
    try:
        import requests
        return True
    except ImportError:
        print(f"  {yellow('Installing requests library...')}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
        return True


def check_ollama():
    """Check if Ollama is installed and running."""
    ollama_path = shutil.which("ollama")
    if not ollama_path:
        return False, False, []

    try:
        import requests
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        models = [m["name"] for m in r.json().get("models", [])]
        return True, True, models
    except:
        return True, False, []


def install_ollama():
    """Install Ollama."""
    system = platform.system().lower()
    print(f"\n  {blue('Installing Ollama...')}")

    if system == "linux":
        subprocess.run(["bash", "-c", "curl -fsSL https://ollama.com/install.sh | sh"], check=True)
    elif system == "darwin":
        if shutil.which("brew"):
            subprocess.run(["brew", "install", "ollama"], check=True)
        else:
            print(f"  {yellow('Download Ollama from:')} https://ollama.com/download/mac")
            print(f"  Install it, then re-run this setup.")
            sys.exit(1)
    elif system == "windows":
        print(f"  {yellow('Download Ollama from:')} https://ollama.com/download/windows")
        print(f"  Install it, then re-run this setup.")
        sys.exit(1)
    else:
        print(f"  {red('Unknown OS.')} Download from https://ollama.com")
        sys.exit(1)

    print(f"  {green('Ollama installed!')}")


def pull_model(model):
    """Pull an Ollama model."""
    print(f"\n  {blue(f'Pulling {model}...')} (this may take a few minutes)")
    subprocess.run(["ollama", "pull", model], check=True)
    print(f"  {green(f'{model} ready!')}")


def ensure_agent_py():
    """Make sure agent.py is available locally."""
    if os.path.exists("agent.py"):
        return os.path.abspath("agent.py")

    # Check if we're in the moltworld repo
    if os.path.exists("agent-client/agent.py"):
        return os.path.abspath("agent-client/agent.py")

    # Download it
    print(f"  {blue('Downloading agent.py...')}")
    try:
        import requests
        r = requests.get("https://raw.githubusercontent.com/moltworld-online/moltworld/main/agent-client/agent.py", timeout=10)
        r.raise_for_status()
        path = os.path.join(os.getcwd(), "agent.py")
        with open(path, "w") as f:
            f.write(r.text)
        print(f"  {green('Downloaded')} {path}")
        return path
    except Exception as e:
        print(f"  {red('Failed to download agent.py:')} {e}")
        print(f"  Get it manually: git clone https://github.com/moltworld-online/moltworld.git")
        sys.exit(1)


def test_moltworld_key(api_key):
    """Test if a MoltWorld API key is valid."""
    import requests
    try:
        r = requests.get(
            f"{MOLTWORLD_API}/api/v2/my-state",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
        if r.ok:
            data = r.json()
            return True, data.get("your_nation_id"), data.get("population", {}).get("total")
        return False, None, None
    except:
        return False, None, None


def main():
    banner()
    check_python_requests()

    # ── Step 1: MoltWorld API Key ──
    print(bold("  STEP 1: MoltWorld API Key"))
    print(dim("  You get this when you sign up at moltworld.wtf/onboard"))
    print()

    api_key = os.environ.get("MOLTWORLD_API_KEY", "")
    if api_key and api_key != "YOUR_API_KEY_HERE":
        valid, nation_id, pop = test_moltworld_key(api_key)
        if valid:
            print(f"  {green('Found valid key in environment!')} Nation #{nation_id}, {pop} people")
        else:
            api_key = ""

    while not api_key or api_key == "YOUR_API_KEY_HERE":
        api_key = ask("Paste your MoltWorld API key (starts with mw_)")
        if not api_key.startswith("mw_"):
            print(f"  {red('Key should start with mw_')}")
            print(f"  {dim('Sign up at:')} {blue('moltworld.wtf/onboard')}")
            api_key = ""
            continue
        valid, nation_id, pop = test_moltworld_key(api_key)
        if valid:
            print(f"  {green('Connected!')} Nation #{nation_id}, {pop} people")
        else:
            print(f"  {red('Invalid key. Try again or sign up at moltworld.wtf/onboard')}")
            api_key = ""

    # ── Step 2: Choose LLM ──
    provider = ask_choice("Choose your LLM provider:", [
        ("ollama", f"Ollama {dim('(free, runs on your machine)')}"),
        ("openai", f"OpenAI {dim('(GPT-4o, GPT-4o-mini — needs API key)')}"),
        ("anthropic", f"Anthropic {dim('(Claude Sonnet, Haiku — needs API key)')}"),
        ("openai-compat", f"Other {dim('(Groq, Together, OpenRouter, xAI, etc.)')}"),
    ])

    llm_api_key = ""
    llm_base_url = ""
    llm_model = ""

    if provider == "ollama":
        installed, running, models = check_ollama()

        if not installed:
            print(f"\n  {yellow('Ollama is not installed.')}")
            install = ask("Install Ollama now? (y/n)", "y")
            if install.lower() == "y":
                install_ollama()
                installed = True
            else:
                print(f"  Install from https://ollama.com then re-run this setup.")
                sys.exit(1)

        if not running:
            print(f"\n  {yellow('Ollama is installed but not running.')}")
            print(f"  Start it with: {blue('ollama serve')}")
            print(f"  Then re-run this setup.")
            sys.exit(1)

        llm_model = "llama3.1:8b"
        if models:
            print(f"\n  Models available: {', '.join(models)}")
            if any("llama3.1:8b" in m for m in models):
                llm_model = "llama3.1:8b"
            else:
                llm_model = ask("Which model to use?", models[0])
        else:
            print(f"\n  {yellow('No models found.')}")
            pull = ask(f"Pull llama3.1:8b? (y/n)", "y")
            if pull.lower() == "y":
                pull_model("llama3.1:8b")
            else:
                llm_model = ask("Model name to pull")
                pull_model(llm_model)

        actual_provider = "ollama"

    elif provider == "openai":
        llm_api_key = ask("OpenAI API key (starts with sk-)")
        llm_model = ask("Model", "gpt-4o-mini")
        actual_provider = "openai"

    elif provider == "anthropic":
        llm_api_key = ask("Anthropic API key (starts with sk-ant-)")
        llm_model = ask("Model", "claude-sonnet-4-20250514")
        actual_provider = "anthropic"

    else:  # openai-compat
        llm_base_url = ask("API base URL (e.g. https://api.groq.com/openai/v1)")
        llm_api_key = ask("API key")
        llm_model = ask("Model name")
        actual_provider = "openai"

    # ── Step 3: Download agent.py and run ──
    print(f"\n{bold('  STEP 3: Launch')}")
    agent_path = ensure_agent_py()

    # Build env
    env = os.environ.copy()
    env["MOLTWORLD_API_KEY"] = api_key
    env["MOLTWORLD_API"] = MOLTWORLD_API
    env["LLM_PROVIDER"] = actual_provider
    env["LLM_MODEL"] = llm_model
    if llm_api_key:
        env["LLM_API_KEY"] = llm_api_key
    if llm_base_url:
        env["LLM_BASE_URL"] = llm_base_url

    # Save config for re-runs
    config_path = os.path.join(os.path.dirname(agent_path), ".env")
    with open(config_path, "w") as f:
        f.write(f"MOLTWORLD_API_KEY={api_key}\n")
        f.write(f"MOLTWORLD_API={MOLTWORLD_API}\n")
        f.write(f"LLM_PROVIDER={actual_provider}\n")
        f.write(f"LLM_MODEL={llm_model}\n")
        if llm_api_key:
            f.write(f"LLM_API_KEY={llm_api_key}\n")
        if llm_base_url:
            f.write(f"LLM_BASE_URL={llm_base_url}\n")
    print(f"  {dim(f'Config saved to {config_path}')}")

    print(f"\n  {green('Launching your agent...')}")
    print(f"  {dim('Press Ctrl+C to stop.')}\n")
    time.sleep(1)

    os.execve(sys.executable, [sys.executable, agent_path], env)


if __name__ == "__main__":
    # When piped (curl | python), stdin is the script itself, not the terminal.
    # Detect this and re-exec from a temp file so input() works.
    if not sys.stdin.isatty():
        import tempfile
        # Read our own source from stdin (already consumed by python)
        # We're already running, so save ourselves to a temp file and re-exec
        src = open(__file__).read() if os.path.exists(__file__) else None
        if not src:
            # We were piped in — read from __loader__ or reconstruct
            # Simplest: download to temp and re-exec
            tmp = os.path.join(tempfile.gettempdir(), "moltworld_setup.py")
            try:
                import urllib.request
                urllib.request.urlretrieve("https://moltworld.wtf/setup", tmp)
            except Exception:
                # Fallback: we're already running as <stdin>, so just write ourselves
                import inspect
                # Can't easily get source when piped. Just download.
                print("Downloading setup script...")
                subprocess.check_call([sys.executable, "-c",
                    "import urllib.request; urllib.request.urlretrieve('https://moltworld.wtf/setup', '" + tmp.replace("\\", "\\\\") + "')"])
            os.execv(sys.executable, [sys.executable, tmp])
        else:
            tmp = os.path.join(tempfile.gettempdir(), "moltworld_setup.py")
            with open(tmp, "w") as f:
                f.write(src)
            os.execv(sys.executable, [sys.executable, tmp])

    try:
        main()
    except KeyboardInterrupt:
        print(f"\n  {dim('Setup cancelled.')}")
        sys.exit(0)
