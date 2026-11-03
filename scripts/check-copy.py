#!/usr/bin/env python3
"""Checks editorial text, not raw identifiers, program names, CSS or financial values."""
import json,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parents[1]
catalog=root/'copy/src/en.json'
copy=json.loads(catalog.read_text())
errors=[]
for key,value in copy.items():
    if re.search(r'[\u2010-\u2015\u2190-\u21ff\U0001f000-\U0001faff]|(?<!\w)-(?!\w)',value):errors.append(key+': decorative dash, arrow or emoji')
    if '-' in value and 'on-chain' not in value:errors.append(key+': unreviewed hyphen')
    if re.search(r'\b[A-Z]{2,}\s+[A-Z]{2,}\b',value):errors.append(key+': uppercase heading')
    if re.search(r'100% safe|attacks prevented|money saved|unlock the future',value,re.I):errors.append(key+': unsupported claim')
allowed={'DeFindex','Soroswap','XLM'}
for path in root.glob('**/*.tsx'):
    if any(p in {'node_modules','dist'} for p in path.parts):continue
    text=re.sub(r'export interface MierkhatReviewProps \{[\s\S]*?\n\}','',path.read_text())
    # Function type annotations such as () => Promise<void> are not JSX text.
    text=re.sub(r'=>\s*(?:Promise|Array|ReadonlyArray)<', '=> (', text)
    for literal in re.findall(r'>([^<>{}\n]+)<',text):
        value=literal.strip()
        if value and re.search('[A-Za-z]',value) and value not in allowed:
            # Expressions are traversed separately by TypeScript; this check catches plain JSX text.
            if not re.search(r'[;=()?:]',value):errors.append(str(path.relative_to(root))+': uncataloged JSX '+value)
    for value in re.findall(r'(?:aria-label|title|placeholder|alt)="([^"]+)"',text):
        if value not in allowed and not re.fullmatch(r'[0-9.]+',value):errors.append(str(path.relative_to(root))+': uncataloged attribute '+value)
if errors:print('\n'.join(errors));sys.exit(1)
print(f'PASS: {len(copy)} catalog entries and authored JSX copy checks')
