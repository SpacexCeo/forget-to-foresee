import re,sys
n=int(sys.argv[1]); p='README.md'; s=open(p,encoding='utf-8').read()
s=re.sub(r'(`cd game && npm test` → `# pass )\d+',lambda m:m.group(1)+str(n),s)
s=re.sub(r'(npm test {12}# )\d+( tests)',lambda m:m.group(1)+str(n)+m.group(2),s)
s=re.sub(r'`# tests \d+` / `# pass \d+`',f'`# tests {n}` / `# pass {n}`',s)
s=re.sub(r'What the \d+ tests cover \(the breakdown below is the 260 of the first measurement;[^\n]*',
  f'What the {n} tests cover (the breakdown below is the 260 of the first measurement; {n-260} were added on 08.11 for the Shell hub, the uk/it/zh locales, mobile play, audio/VFX cues, locomotion and camera, the island map, the NEAR read-only client, the tutorial and first loop, the living agents, the motion system, the independent verifiers and QA regressions):',s)
open(p,'w',encoding='utf-8').write(s)
print(len(re.findall(str(n),s)))
