#!/usr/bin/env python3
"""Prepare the official pinned extension in an isolated, ignored test directory."""
import hashlib,json,pathlib,secrets,urllib.request,zipfile,os
root=pathlib.Path(__file__).resolve().parents[2]
dir=root/'.tooling/freighter';dir.mkdir(parents=True,exist_ok=True,mode=0o700);dir.chmod(0o700)
archive=dir/'release.zip';expected='2e9371c0fe00b01c8bf1389aa2a63755e7ceb44ab15c857fc0eee5adfebb7e7d'
if not archive.exists():
    data=urllib.request.urlopen('https://github.com/stellar/freighter/releases/download/5.49.0/build-5.49.0.zip',timeout=60).read()
    if hashlib.sha256(data).hexdigest()!=expected:raise SystemExit('Official extension checksum mismatch')
    archive.write_bytes(data)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise SystemExit('Official extension checksum mismatch')
output=dir/'unpacked';output.mkdir(exist_ok=True)
with zipfile.ZipFile(archive)as z:
    for item in z.infolist():
        if not (output/item.filename).resolve().is_relative_to(output.resolve()):raise SystemExit('Unsafe archive path')
    z.extractall(output)
credentials=dir/'credentials.json'
if not credentials.exists():
    fd=os.open(credentials,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w')as f:json.dump({'password':'Test!'+secrets.token_hex(20)},f)
credentials.chmod(0o600)
print('Official Freighter 5.49.0 verified. Isolated test profile is ready for onboarding.')
