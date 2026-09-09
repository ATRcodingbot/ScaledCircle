"""Verify approved native source assets and their release-bundle provenance.

macOS additionally decodes and compares the compiled iOS launcher pixels using
AppKit; Android PNGs are decoded with the existing sharp tool for comparison.
No network, image generation, account access or artifact mutation occurs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SYMBOL_SHA = '1b21dabe8d32acd3e62fd413359caecd39534be6170bb869c6ab35030df420c1'


def verify_source(root=ROOT):
    mobile = root / 'apps/mobile'
    manifest = json.loads((mobile / 'assets/brand/native-brand-manifest.json').read_text())
    if manifest['sourceSha256'] != SYMBOL_SHA or hashlib.sha256((root / manifest['source']).read_bytes()).hexdigest() != SYMBOL_SHA:
        raise ValueError('Canonical symbol mismatch')
    if manifest['version'] != 'ScaledCircleNativeBrandV1' or len(manifest['files']) != 33:
        raise ValueError('Native branding inventory mismatch')
    for relative, item in manifest['files'].items():
        data = (mobile / relative).read_bytes()
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError('Native artwork changed: ' + relative)
        if data[:8] != b'\x89PNG\r\n\x1a\n' or int.from_bytes(data[16:20], 'big') != item['size'] or int.from_bytes(data[20:24], 'big') != item['size']:
            raise ValueError('Wrong native image size: ' + relative)
        if item['opaque'] and data[25] != 2:
            raise ValueError('Opaque launcher must have RGB data with no alpha channel: ' + relative)
    android = mobile / 'android/app/src/main'
    if 'android:label="ScaledCircle"' not in (android / 'AndroidManifest.xml').read_text():
        raise ValueError('Wrong customer app name')
    for folder in ['drawable', 'drawable-v21']:
        xml = (android / 'res' / folder / 'launch_background.xml').read_text()
        if '@drawable/launch_symbol' not in xml or '@color/launch_surface' not in xml:
            raise ValueError('Android legacy splash is not wired to the canonical symbol')
    adaptive = (android / 'res/mipmap-anydpi-v26/ic_launcher.xml').read_text()
    if '@drawable/ic_launcher_foreground' not in adaptive or '@color/launch_surface' not in adaptive:
        raise ValueError('Adaptive launcher binding missing')
    for folder in ['values-v31', 'values-night-v31']:
        xml = (android / 'res' / folder / 'styles.xml').read_text()
        if 'windowSplashScreenAnimatedIcon' not in xml or '@mipmap/ic_launcher' not in xml or '@color/launch_surface' not in xml:
            raise ValueError('Android 12 light/dark splash binding missing')
    storyboard = (mobile / 'ios/Runner/Base.lproj/LaunchScreen.storyboard').read_text()
    if 'image="LaunchImage"' not in storyboard or 'width="144" height="144"' not in storyboard or '0.9607843137' not in storyboard:
        raise ValueError('iOS launch artwork/canvas binding missing')
    return manifest


def embedded_manifest(archive, name, manifest):
    if json.loads(archive.read(name)) != manifest:
        raise ValueError('Built branding manifest differs from verified source')


def verify_ipa(ipa, manifest, root=ROOT):
    if platform.system() != 'Darwin':
        raise ValueError('Compiled iOS branding requires the macOS AppKit comparison')
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(ipa) as z:
        app = 'Payload/Runner.app/'
        embedded_manifest(z, app + 'Frameworks/App.framework/flutter_assets/assets/brand/native-brand-manifest.json', manifest)
        icon = app + 'AppIcon60x60@2x.png'
        if icon not in z.namelist() or not any(n.startswith(app) and 'LaunchScreen.storyboardc/' in n for n in z.namelist()):
            raise ValueError('Native launcher/launch storyboard missing')
        actual = Path(tmp) / 'compiled-icon.png'
        actual.write_bytes(z.read(icon))
        expected = root / 'apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png'
        swift = Path(tmp) / 'compare.swift'
        swift.write_text('''import AppKit
let paths = CommandLine.arguments.dropFirst()
let images = paths.map { NSBitmapImageRep(data: try! Data(contentsOf: URL(fileURLWithPath: $0)))! }
let a=images[0], b=images[1]
guard a.pixelsWide == b.pixelsWide && a.pixelsHigh == b.pixelsHigh else { fatalError("Icon size mismatch") }
var error=0.0
for y in 0..<a.pixelsHigh { for x in 0..<a.pixelsWide {
 let p=a.colorAt(x:x,y:y)!.usingColorSpace(.sRGB)!, q=b.colorAt(x:x,y:y)!.usingColorSpace(.sRGB)!
 error += abs(p.redComponent-q.redComponent)+abs(p.greenComponent-q.greenComponent)+abs(p.blueComponent-q.blueComponent)
} }
guard error/Double(a.pixelsWide*a.pixelsHigh*3) < 0.015 else { fatalError("Compiled icon is not the approved symbol") }
print("Compiled iOS launcher pixel comparison PASS")
''')
        subprocess.run(['swift', str(swift), str(actual), str(expected)], check=True)
        car = Path(tmp) / 'Assets.car'
        car.write_bytes(z.read(app + 'Assets.car'))
        info = json.loads(subprocess.check_output(['xcrun', 'assetutil', '--info', str(car)], text=True))
        names = {entry.get('Name') for entry in info}
        if 'AppIcon' not in names or 'LaunchImage' not in names:
            raise ValueError('Compiled icon/splash asset catalog binding missing')
    return 'PASS: compiled icon pixels, launch storyboard/catalog, sealed source assets'


def verify_aab(aab, manifest, root=ROOT):
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(aab) as z:
        embedded_manifest(z, 'base/assets/flutter_assets/assets/brand/native-brand-manifest.json', manifest)
        comparisons = []
        for name in z.namelist():
            if name.startswith('base/res/') and name.endswith(('/ic_launcher.png', '/launch_symbol.png', '/ic_launcher_foreground.png')):
                # aapt adds version qualifiers to density directories.
                folder, filename = name.split('/')[-2:]
                density = next((d for d in ['xxxhdpi','xxhdpi','xhdpi','hdpi','mdpi'] if d in folder), None)
                if not density:
                    raise ValueError('Unrecognized native asset density')
                kind = 'mipmap' if filename == 'ic_launcher.png' else 'drawable'
                source = root / f'apps/mobile/android/app/src/main/res/{kind}-{density}/{filename}'
                target = Path(tmp) / (folder + '-' + filename)
                target.write_bytes(z.read(name))
                comparisons.append([str(source), str(target)])
        if len(comparisons) != 15:
            raise ValueError(f'Expected 15 compiled Android branding PNGs; found {len(comparisons)}')
        script = """const sharp=require(process.argv[1]), pairs=JSON.parse(process.argv[2]);(async()=>{for(const [a,b] of pairs){const x=await sharp(a).ensureAlpha().raw().toBuffer({resolveWithObject:true}),y=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});if(x.info.width!==y.info.width||x.info.height!==y.info.height)throw Error('Brand size mismatch');let sum=0;for(let i=0;i<x.data.length;i++)sum+=Math.abs(x.data[i]-y.data[i]);if(sum/x.data.length>3)throw Error('Compiled Android artwork mismatch');}console.log('Compiled Android launcher/splash pixels PASS');})().catch(e=>{console.error(e.message);process.exit(1)});"""
        subprocess.run(['node','-e',script,str(root / 'functions/node_modules/sharp'),json.dumps(comparisons)],check=True)
        if not any('mipmap-anydpi-v26' in n and n.endswith('/ic_launcher.xml') for n in z.namelist()):
            raise ValueError('Adaptive icon resource missing')
    return 'PASS: compiled launcher/splash pixels, adaptive resource, sealed source assets'


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--ipa',type=Path)
    parser.add_argument('--aab',type=Path)
    args=parser.parse_args()
    manifest=verify_source()
    result={'source':'PASS','canonicalSymbolSha256':SYMBOL_SHA,'nativeImages':len(manifest['files'])}
    if args.ipa: result['ios']=verify_ipa(args.ipa,manifest)
    if args.aab: result['android']=verify_aab(args.aab,manifest)
    print(json.dumps(result,indent=2))
