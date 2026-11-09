import re,sys
for p in sys.argv[1:]:
    s=open(p,encoding='utf-8').read()
    s=re.sub(r'<<<<<<< [^\n]*\n(.*?)(?:\|\|\|\|\|\|\| [^\n]*\n.*?)?=======\n(.*?)>>>>>>> [^\n]*\n', lambda m:m.group(1)+''.join(l for l in m.group(2).splitlines(True) if l not in m.group(1)), s, flags=re.S)
    open(p,'w',encoding='utf-8').write(s)
