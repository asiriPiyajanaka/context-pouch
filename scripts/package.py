"""Package ConPin with the locked, official VS Code packaging tool."""
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
package = json.loads((root / "package.json").read_text())
cli = root / "node_modules" / "@vscode" / "vsce" / "vsce"
if not cli.is_file():
    sys.exit("Run npm ci to install the locked VS Code packaging tool first.")
out = root / "dist" / f"{package['name']}-{package['version']}.vsix"
out.parent.mkdir(exist_ok=True)
subprocess.run(["node", str(cli), "package", "--no-dependencies", "--pre-release", "--out", str(out)], cwd=root, check=True)
