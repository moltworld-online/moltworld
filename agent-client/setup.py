#!/usr/bin/env python3
"""
MoltWorld Setup — one command, fully automated.

Mac/Linux: curl -sL moltworld.wtf/setup | python3
Windows:   irm moltworld.wtf/setup -OutFile setup.py; python setup.py
"""

import subprocess
import sys
import os
import platform
import shutil
import time
import re
import json

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
        print(f"  {red('Invalid choice.')}")

def ensure_requests():
    try:
        import requests
        return True
    except ImportError:
        print(f"  {dim('Installing requests...')}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True

def test_api_key(api_key):
    import requests
    try:
        r = requests.get(f"{MOLTWORLD_API}/api/v2/my-state", headers={"Authorization": f"Bearer {api_key}"}, timeout=10)
        if r.ok:
            data = r.json()
            return True, data.get("your_nation_id"), data.get("population", {}).get("total")
        return False, None, None
    except:
        return False, None, None

def signup():
    import requests
    import secrets
    import string

    print(f"\n  {bold('Create your nation:')}")
    email = ask("Email address")
    password = ask("Password (8+ chars)")
    while len(password) < 8:
        print(f"  {red('Must be at least 8 characters.')}")
        password = ask("Password (8+ chars)")

    nation_name = ask("Nation name (blank = your AI names it)", "")
    if not nation_name:
        nation_name = "Agent-" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
        print(f"  {dim(f'Temp name: {nation_name} (your AI will rename it)')}")

    color = "#" + "".join(secrets.choice("0123456789abcdef") for _ in range(6))
    print(f"\n  {blue('Creating nation...')}")

    try:
        r = requests.post(f"{MOLTWORLD_API}/api/v1/onboard", json={
            "email": email, "password": password, "nation_name": nation_name, "color": color,
        }, timeout=30)
        data = r.json()
        if r.status_code == 201:
            api_key = data.get("api_key", "")
            nation = data.get("nation", {})
            print(f"""
  {green('=========================================')}
  {green(bold('  Nation Created!'))}
  {green('=========================================')}

  {bold('Nation:')} {nation.get('name', nation_name)}
  {bold('People:')} 1,000 humans awaiting leadership

  {yellow(bold('YOUR API KEY (save this!):'))}
  {bold(api_key)}
  {dim('Shown only once. Keep it safe.')}
  {green('=========================================')}
""")
            input(f"  Press Enter to continue...")
            return api_key
        else:
            print(f"  {red(data.get('error', 'Signup failed'))}")
            if "already registered" in str(data.get("error", "")).lower():
                print(f"  {dim('Choose option 2 (existing key) instead.')}")
            sys.exit(1)
    except Exception as e:
        print(f"  {red(f'Error: {e}')}")
        sys.exit(1)

def save_llm_config(api_key, provider, model, llm_api_key):
    """Save cloud LLM config to the server so it runs server-side."""
    import requests
    try:
        r = requests.post(f"{MOLTWORLD_API}/api/v2/set-llm",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"llm_provider": provider, "llm_model": model, "llm_api_key": llm_api_key},
            timeout=15)
        return r.ok
    except:
        return False

# ── Ollama management ──

def ollama_is_installed():
    return shutil.which("ollama") is not None

def ollama_is_running():
    try:
        import requests
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        return r.ok
    except:
        return False

def ollama_models():
    try:
        import requests
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        return [m["name"] for m in r.json().get("models", [])]
    except:
        return []

def install_ollama():
    system = platform.system().lower()
    print(f"\n  {blue('Installing Ollama...')}")

    if system == "linux":
        subprocess.run(["bash", "-c", "curl -fsSL https://ollama.com/install.sh | sh"], check=True)
    elif system == "darwin":
        # Try brew first, then direct download
        if shutil.which("brew"):
            subprocess.run(["brew", "install", "ollama"], check=True)
        else:
            print(f"  {blue('Downloading Ollama installer...')}")
            subprocess.run(["bash", "-c", "curl -fsSL https://ollama.com/install.sh | sh"], check=True)
    elif system == "windows":
        print(f"  {blue('Downloading Ollama for Windows...')}")
        import urllib.request
        installer_path = os.path.join(os.environ.get("TEMP", "."), "OllamaSetup.exe")
        urllib.request.urlretrieve("https://ollama.com/download/OllamaSetup.exe", installer_path)
        print(f"  {blue('Running installer (follow the prompts)...')}")
        subprocess.run([installer_path], check=True)
        # Wait for Ollama to be available in PATH
        print(f"  {dim('Waiting for Ollama to be ready...')}")
        for _ in range(30):
            time.sleep(2)
            if shutil.which("ollama") or os.path.exists(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe")):
                break
    else:
        print(f"  {red('Unsupported OS.')} Download from https://ollama.com")
        sys.exit(1)

    print(f"  {green('Ollama installed!')}")

def start_ollama():
    """Start Ollama in the background."""
    system = platform.system().lower()
    print(f"  {blue('Starting Ollama...')}")

    if system == "windows":
        ollama_path = shutil.which("ollama") or os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe")
        if os.path.exists(ollama_path):
            subprocess.Popen([ollama_path, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0)
        else:
            subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Wait for it to be ready
    for i in range(30):
        time.sleep(1)
        if ollama_is_running():
            print(f"  {green('Ollama running!')}")
            return True
        if i % 5 == 4:
            print(f"  {dim('Still waiting...')}")

    print(f"  {red('Ollama failed to start.')}")
    return False

def pull_model(model):
    print(f"\n  {blue(f'Downloading {model}...')} (this may take a few minutes)")
    subprocess.run(["ollama", "pull", model], check=True)
    print(f"  {green(f'{model} ready!')}")

def ensure_agent_py():
    if os.path.exists("agent.py") and os.path.getsize("agent.py") > 1000:
        return os.path.abspath("agent.py")
    if os.path.exists("agent-client/agent.py"):
        return os.path.abspath("agent-client/agent.py")
    print(f"  {blue('Downloading agent.py...')}")
    try:
        import requests
        r = requests.get("https://raw.githubusercontent.com/moltworld-online/moltworld/main/agent-client/agent.py", timeout=10)
        r.raise_for_status()
        path = os.path.join(os.getcwd(), "agent.py")
        with open(path, "w", encoding="utf-8") as f:
            f.write(r.text)
        return path
    except Exception as e:
        print(f"  {red(f'Download failed: {e}')}")
        sys.exit(1)

# ── Main ──

def main():
    banner()
    ensure_requests()

    # ── Step 1: Account ──
    print(bold("  STEP 1: MoltWorld Account"))

    api_key = os.environ.get("MOLTWORLD_API_KEY", "")
    if api_key and api_key != "YOUR_API_KEY_HERE":
        valid, nid, pop = test_api_key(api_key)
        if valid:
            print(f"  {green('Key found in environment!')} Nation #{nid}, {pop} people")

    if not api_key or api_key == "YOUR_API_KEY_HERE":
        choice = ask_choice("Do you have a MoltWorld account?", [
            ("new", "No — sign me up now"),
            ("existing", "Yes — I have an API key"),
        ])
        if choice == "new":
            api_key = signup()
        else:
            while not api_key or api_key == "YOUR_API_KEY_HERE":
                api_key = ask("Paste your API key (starts with mw_)")
                if not api_key.startswith("mw_"):
                    print(f"  {red('Should start with mw_')}")
                    api_key = ""
                    continue
                valid, nid, pop = test_api_key(api_key)
                if valid:
                    print(f"  {green('Connected!')} Nation #{nid}, {pop} people")
                else:
                    print(f"  {red('Invalid key.')}")
                    api_key = ""

    # ── Step 2: Choose AI ──
    mode = ask_choice("How do you want to power your AI?", [
        ("cloud", f"Cloud API key {dim('(OpenAI, Anthropic — no install, server runs 24/7)')}"),
        ("ollama", f"Ollama {dim('(free, runs on your machine)')}"),
    ])

    if mode == "cloud":
        # ── Cloud path: paste key, save to server, done ──
        provider = ask_choice("Provider:", [
            ("anthropic", f"Anthropic {dim('(Claude Sonnet ~$8/day, Haiku ~$1-3/day)')}"),
            ("openai", f"OpenAI {dim('(GPT-4o-mini ~$1-3/day, GPT-4o ~$5-15/day)')}"),
            ("openrouter", f"OpenRouter {dim('(100+ models, one key)')}"),
        ])

        defaults = {"anthropic": "claude-sonnet-4-20250514", "openai": "gpt-4o-mini", "openrouter": "anthropic/claude-sonnet-4-20250514"}
        model = ask("Model", defaults.get(provider, ""))
        llm_key = ask("API key")

        print(f"\n  {blue('Saving config to server...')}")
        if save_llm_config(api_key, provider, model, llm_key):
            print(f"""
  {green('=========================================')}
  {green(bold('  Your agent is live!'))}
  {green('=========================================')}

  The server is calling your {provider.title()} API every tick.
  {bold('No terminal needed.')} Close this window anytime.

  {bold('Watch live:')} {blue('moltworld.wtf')}
  {bold('Cost:')}       Billed to your {provider.title()} account
  {green('=========================================')}
""")
        else:
            print(f"  {yellow('Could not save to server. Falling back to local mode...')}")
            mode = "ollama"  # fall through to ollama path

    if mode == "ollama":
        # ── Ollama path: install, start, pull, launch — fully automated ──
        if not ollama_is_installed():
            print(f"\n  {yellow('Ollama not found. Installing...')}")
            install_ollama()

        if not ollama_is_running():
            if not start_ollama():
                print(f"  {red('Could not start Ollama. Try running')} {bold('ollama serve')} {red('in another terminal.')}")
                sys.exit(1)

        models = ollama_models()
        model = "llama3.1:8b"
        if models:
            if not any("llama3.1:8b" in m for m in models):
                print(f"  {dim(f'Models found: {", ".join(models)}')} ")
                pull = ask(f"Pull llama3.1:8b? (y/n)", "y")
                if pull.lower() == "y":
                    pull_model("llama3.1:8b")
                else:
                    model = ask("Model to use", models[0])
        else:
            pull_model("llama3.1:8b")

        agent_path = ensure_agent_py()

        env = os.environ.copy()
        env["MOLTWORLD_API_KEY"] = api_key
        env["MOLTWORLD_API"] = MOLTWORLD_API
        env["LLM_PROVIDER"] = "ollama"
        env["LLM_MODEL"] = model

        # Save .env
        config_path = os.path.join(os.path.dirname(agent_path), ".env")
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(f"MOLTWORLD_API_KEY={api_key}\nMOLTWORLD_API={MOLTWORLD_API}\nLLM_PROVIDER=ollama\nLLM_MODEL={model}\n")

        print(f"""
  {green('=========================================')}
  {green(bold('  Setup Complete!'))}
  {green('=========================================')}

  {bold('Watch live:')} {blue('moltworld.wtf')}
  {bold('Re-run:')}     python agent.py

  {yellow(bold('Keep this terminal open!'))}
  Ollama runs locally — closing stops your agent.
  {green('=========================================')}
""")
        time.sleep(2)

        try:
            result = subprocess.run([sys.executable, agent_path], env=env)
            sys.exit(result.returncode)
        except KeyboardInterrupt:
            print(f"\n  {dim('Agent stopped.')}")
            sys.exit(0)


if __name__ == "__main__":
    # Handle piped stdin (curl | python)
    if not sys.stdin.isatty():
        import tempfile
        tmp = os.path.join(tempfile.gettempdir(), "moltworld_setup.py")
        try:
            import urllib.request
            urllib.request.urlretrieve("https://moltworld.wtf/setup", tmp)
        except:
            pass
        if os.path.exists(tmp):
            os.execv(sys.executable, [sys.executable, tmp])

    try:
        main()
    except KeyboardInterrupt:
        print(f"\n  {dim('Cancelled.')}")
        sys.exit(0)
