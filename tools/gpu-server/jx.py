#!/usr/bin/env python3
"""Tiny Jupyter client for the rented GPU server (scratchpad only, never committed).
  jx.py run "<shell cmd>" [timeout_s]   run a shell command on the server, print output, exit with its code
  jx.py put <local> <remote>            upload a file (remote path relative to /root)
  jx.py get <remote> <local>            download a file
"""
import base64, json, os, sys, uuid, time
from urllib.parse import urlparse
import requests, websocket

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', os.environ.get('JXD', 'gpu'))
HOST = open(os.path.join(D, 'host')).read().strip()
TOK = open(os.path.join(D, 'jtoken')).read().strip()
BASE = 'https://' + HOST
H = {'Authorization': 'token ' + TOK}
CA = '/root/.ccr/ca-bundle.crt'
PROXY = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')

def retry(fn, n=6):
    for i in range(n):
        try:
            r = fn()
            if getattr(r, 'status_code', 200) < 500: return r
        except Exception as e:
            if i == n - 1: raise
        time.sleep(3 + 2 * i)
    return r

def kernel():
    kf = os.path.join(D, 'kernel_' + os.environ.get('JKID', 'main'))
    if os.path.exists(kf):
        kid = open(kf).read().strip()
        if retry(lambda: requests.get(f'{BASE}/api/kernels/{kid}', headers=H, verify=CA)).status_code == 200: return kid
    kid = retry(lambda: requests.post(f'{BASE}/api/kernels', headers=H, json={'name': 'python3'}, verify=CA)).json()['id']
    open(kf, 'w').write(kid); return kid

def run(cmd, timeout=110):
    kid = kernel()
    p = urlparse(PROXY) if PROXY else None
    ws = retry(lambda: websocket.create_connection(f'wss://{HOST}/api/kernels/{kid}/channels', header=[f'Authorization: token {TOK}'],
        sslopt={'ca_certs': CA}, http_proxy_host=p.hostname if p else None, http_proxy_port=p.port if p else None, proxy_type='http' if p else None,
        http_proxy_auth=(p.username, p.password) if p and p.username else None, timeout=timeout + 15))
    code = ('import subprocess,sys\n'
            f'r=subprocess.run({cmd!r},shell=True,executable="/bin/bash",stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout={timeout})\n'
            'sys.stdout.write(r.stdout.decode("utf-8","replace")[-60000:]); print("\\n__RC__=%d" % r.returncode)')
    mid = uuid.uuid4().hex
    msg = {'header': {'msg_id': mid, 'username': 'jx', 'session': uuid.uuid4().hex, 'msg_type': 'execute_request', 'version': '5.3'},
           'parent_header': {}, 'metadata': {}, 'content': {'code': code, 'silent': False, 'store_history': False, 'user_expressions': {}, 'allow_stdin': False, 'stop_on_error': True}, 'channel': 'shell'}
    ws.send(json.dumps(msg)); out = []; rc = 1
    while True:
        m = json.loads(ws.recv())
        if m.get('parent_header', {}).get('msg_id') != mid: continue
        t = m['msg_type']
        if t == 'stream': out.append(m['content']['text'])
        elif t == 'error': out.append('\n'.join(m['content']['traceback']))
        elif t == 'execute_reply': break
    ws.close(); s = ''.join(out)
    if "__RC__=" in s and s.rsplit("__RC__=", 1)[1].strip().isdigit(): s, rcs = s.rsplit("__RC__=", 1); rc = int(rcs.strip())
    sys.stdout.write(s); return rc

def put(local, remote):
    data = base64.b64encode(open(local, 'rb').read()).decode()
    r = requests.put(f'{BASE}/api/contents/{remote}', headers=H, json={'type': 'file', 'format': 'base64', 'content': data}, verify=CA)
    print(r.status_code, remote); return 0 if r.status_code in (200, 201) else 1

def get(remote, local):
    with requests.get(f'{BASE}/files/{remote}', headers=H, stream=True, verify=CA) as r:
        if r.status_code != 200: print(r.status_code, r.text[:200]); return 1
        os.makedirs(os.path.dirname(os.path.abspath(local)), exist_ok=True)
        with open(local, 'wb') as f:
            for c in r.iter_content(1 << 20): f.write(c)
    print('ok', local, os.path.getsize(local)); return 0

if __name__ == '__main__':
    a = sys.argv[1:]
    import shlex
    sys.exit({'bg': lambda: run('setsid nohup bash -c ' + shlex.quote(a[1]) + ' >/dev/null 2>&1 </dev/null & echo started', 30),
              'run': lambda: run(a[1], int(a[2]) if len(a) > 2 else 110), 'put': lambda: put(a[1], a[2]), 'get': lambda: get(a[1], a[2])}[a[0]]())
