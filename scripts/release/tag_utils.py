#!/usr/bin/env python3
import os,re,sys

def parse(tag:str):
    m=re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)', tag or '')
    if not m:
        return None
    major,minor,patch=map(int,m.groups())
    kind='patch'
    if minor==0 and patch==0:
        kind='major'
    elif patch==0:
        kind='minor'
    return major,minor,patch,kind

tag=os.environ.get('TAG') or (sys.argv[1] if len(sys.argv)>1 else '')
parsed=parse(tag)
if not parsed:
    print('valid=false')
    sys.exit(0)
_,_,_,kind=parsed
print('valid=true')
print(f'kind={kind}')
print(f'run_auto={str(kind in ("minor","major")).lower()}')
