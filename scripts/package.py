"""Build the dependency-free extension as a local VSIX with Python's stdlib."""
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
package = json.loads((root / 'package.json').read_text())
namespace = 'http://schemas.microsoft.com/developer/vsx-schema/2011'
ET.register_namespace('', namespace)
def element(parent, name, attributes=None, text=None):
    node = ET.SubElement(parent, '{%s}%s' % (namespace, name), attributes or {})
    node.text = text
    return node
manifest = ET.Element('{%s}PackageManifest' % namespace, {'Version': '2.0.0'})
metadata = element(manifest, 'Metadata')
element(metadata, 'Identity', {'Language': 'en-US', 'Id': package['name'], 'Version': package['version'], 'Publisher': package['publisher']})
element(metadata, 'DisplayName', text=package['displayName'])
element(metadata, 'Description', {'{http://www.w3.org/XML/1998/namespace}space': 'preserve'}, package['description'])
element(metadata, 'Tags', text=','.join(package['keywords']))
element(metadata, 'Categories', text=','.join(package['categories']))
properties = element(metadata, 'Properties')
for key, value in {'Engine': package['engines']['vscode'], 'ExtensionDependencies': '', 'ExtensionPack': '', 'ExecutesCode': 'true'}.items():
    element(properties, 'Property', {'Id': 'Microsoft.VisualStudio.Code.' + key, 'Value': value})
element(element(manifest, 'Installation'), 'InstallationTarget', {'Id': 'Microsoft.VisualStudio.Code'})
element(manifest, 'Dependencies')
assets = element(manifest, 'Assets')
for kind, file in [('Microsoft.VisualStudio.Code.Manifest', 'package.json'), ('Microsoft.VisualStudio.Services.Content.Details', 'README.md')]:
    element(assets, 'Asset', {'Type': kind, 'Path': 'extension/' + file, 'Addressable': 'true'})
content_types = b'''<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="css" ContentType="text/css"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'''
files = ['package.json', 'README.md', 'extension.js', 'library.js', 'sqlite-store.js', 'rule-state.js', 'pack-files.js', 'generator.js', 'generation-ui.js', 'patcher.js', 'model.js', 'client.js', 'runtime.js', 'host-bridge.js', 'webview-bootstrap.js', 'media/graph.js', 'media/library-view.js', 'media/library-dialogs.js', 'media/graph.css', 'media/pouch.svg']
out = root / 'dist' / f"{package['name']}-{package['version']}.vsix"
out.parent.mkdir(exist_ok=True)
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest', ET.tostring(manifest, encoding='utf-8', xml_declaration=True))
    archive.writestr('[Content_Types].xml', content_types)
    for file in files:
        archive.write(root / file, 'extension/' + file)
print(out)
