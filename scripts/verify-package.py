"""Inspect the actual VSIX for required files, runtime references and private artifacts."""
import json
from pathlib import Path, PurePosixPath
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
package = json.loads((root / "package.json").read_text())
archive_path = root / "dist" / f"{package['name']}-{package['version']}.vsix"
with ZipFile(archive_path) as archive:
    assert archive.testzip() is None, "Corrupt VSIX"
    names = set(archive.namelist())
    files = {name.removeprefix("extension/") for name in names if name.startswith("extension/")}
    required = {"package.json", "readme.md", "LICENSE.txt", "changelog.md", "PRIVACY.md", "SUPPORT.md", "SECURITY.md", "scripts/recover.cjs"}
    assert required <= files, f"Missing public assets: {required - files}"
    for file in files:
        parts = PurePosixPath(file).parts
        assert not any(part in {"node_modules", ".git", "test", "test-results", "dist"} for part in parts), file
        assert not any(part.startswith(".env") for part in parts), file
        assert not re.search(r"\.(sqlite(?:-wal|-shm)?|vsix|pem|key)$", file), file
    shipped = json.loads(archive.read("extension/package.json"))
    assert shipped == package, "Packaged manifest differs from source"
    assert package["main"].removeprefix("./") in files
    assert package["icon"] in files
    # Check literal local CommonJS dependencies from packaged modules.
    for file in files:
        if not file.endswith((".js", ".cjs")):
            continue
        content = archive.read("extension/" + file).decode()
        for ref in re.findall(r'require\(["\'](\.[^"\']+)["\']\)', content):
            target = (root / PurePosixPath(file).parent / ref).resolve().relative_to(root).as_posix()
            assert target in files or target + ".js" in files, f"{file} needs {target}"
        if file == "patcher.js":
            for ref in re.findall(r'read\("([^"]+)"\)', content):
                assert ref in files, f"Injected module missing: {ref}"
        if file == "extension.js":
            for ref in re.findall(r'resource\("([^"]+)"\)', content):
                assert ref in files, f"Webview asset missing: {ref}"
    manifest = ET.fromstring(archive.read("extension.vsixmanifest"))
    assets = {node.attrib.get("Type") for node in manifest.iter() if node.tag.endswith("Asset")}
    assert "Microsoft.VisualStudio.Services.Content.License" in assets, "Missing license asset"
    assert "Microsoft.VisualStudio.Services.Content.Changelog" in assets, "Missing changelog asset"
print(f"Verified {archive_path.name}: {len(files)} shipped files, runtime references, license/changelog assets, and artifact exclusions.")
