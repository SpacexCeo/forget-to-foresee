// English strings of the RPG HUD layer (sprint A2: HUD, hotbar, skills, progression, skill tree, character panel,
// controls). Merged into the English table by A5's seam; until then `hudT()` (rpg/hud-text.js) falls back here.
export default {
  // key binding labels (Settings -> Controls) for the actions added in the sprint
  'set.key.hotbar1': 'Hotbar slot 1', 'set.key.hotbar2': 'Hotbar slot 2', 'set.key.hotbar3': 'Hotbar slot 3', 'set.key.hotbar4': 'Hotbar slot 4', 'set.key.hotbar5': 'Hotbar slot 5',
  'set.key.hotbar6': 'Hotbar slot 6', 'set.key.hotbar7': 'Hotbar slot 7', 'set.key.hotbar8': 'Hotbar slot 8', 'set.key.hotbar9': 'Hotbar slot 9',
  'set.key.journal': 'Journal', 'set.key.map': 'Map', 'set.key.skills': 'Skills', 'set.key.character': 'Character', 'set.key.bag': 'Bag', 'set.key.market': 'Market',
  'set.key.track': 'Track quest (in the journal)', 'set.key.target': 'Next target', 'set.key.help': 'Controls and help',
  'set.kbd.hotbar1': 'Slot 1', 'set.kbd.hotbar2': 'Slot 2', 'set.kbd.hotbar3': 'Slot 3', 'set.kbd.hotbar4': 'Slot 4', 'set.kbd.hotbar5': 'Slot 5',
  'set.kbd.hotbar6': 'Slot 6', 'set.kbd.hotbar7': 'Slot 7', 'set.kbd.hotbar8': 'Slot 8', 'set.kbd.hotbar9': 'Slot 9',
  'set.kbd.journal': 'Journal', 'set.kbd.map': 'Map', 'set.kbd.skills': 'Skills', 'set.kbd.character': 'Hero', 'set.kbd.bag': 'Bag', 'set.kbd.market': 'Market',
  'set.kbd.track': 'Track', 'set.kbd.target': 'Target', 'set.kbd.help': 'Help',
  'set.grp.move': 'Movement', 'set.grp.combat': 'Combat', 'set.grp.skills': 'Skills (1 to 9)', 'set.grp.windows': 'Windows', 'set.grp.misc': 'Other',
  'set.rebind': 'Rebind', 'set.rebind.reset': 'Reset this key', 'set.rebind.press': 'Press a key… (Esc to cancel)',
  'set.rebind.swap': '{key} is used by {action}. Swap?', 'set.rebind.swapYes': 'Swap', 'set.rebind.cancel': 'Cancel',
  'set.rebind.reserved': 'That key is reserved.', 'set.rebind.resetAll': 'Reset all to default', 'set.rebind.resetAllConfirm': 'Reset every key to its default?',
  'help.title': 'Controls', 'help.glossary': 'Open the glossary',

  // cast failures (plan 5.5 / 5.8)
  'hud.fail.dead': 'You cannot do that while down.',
  'hud.fail.unlearned': 'You have not learned that skill yet.',
  'hud.fail.cooldown': 'Not ready yet.',
  'hud.fail.mana': 'Not enough mana.',
  'hud.fail.target': 'Select a target first.',
  'hud.fail.range': 'Target is out of range.',

  // HUD frame
  'hud.hp': 'Health', 'hud.mana': 'Mana', 'hud.level': 'Lv {n}',
  'hud.xp.tip': 'Level {level}: {into} / {need} XP',
  'hud.xp.cap': 'Level {level}: the top level. XP still counts for the board.',
  'hud.hp.tip': 'Health: {cur} / {max}. At zero you wake up at the gate.',
  'hud.mana.tip': 'Mana: {cur} / {max}. Skills spend it; it comes back by itself.',
  'hud.slot.empty': 'Empty slot. Learn skills in the Skills window (N).',
  'hud.slot.tip': '{kind} · Mana {mana} · Cooldown {cd} s',
  'hud.slot.tipFree': '{kind} · Costs nothing · Cooldown {cd} s',
  'hud.kind.melee': 'Melee', 'hud.kind.ranged': 'Ranged', 'hud.kind.control': 'Control', 'hud.kind.movement': 'Movement', 'hud.kind.active': 'Active', 'hud.kind.passive': 'Passive',
  'hud.tray.character': 'Character', 'hud.tray.skills': 'Skills', 'hud.tray.journal': 'Journal', 'hud.tray.map': 'Map', 'hud.tray.bag': 'Bag', 'hud.tray.market': 'Market', 'hud.tray.menu': 'Menu',
  'hud.tray.notNow': 'Not now', 'hud.tray.soon': 'Opens when that window is ready.',
  'hud.log.tab.log': 'Log', 'hud.log.tab.chat': 'Chat', 'hud.log.tab.loot': 'Loot',
  'hud.log.chatEmpty': 'No one nearby has said anything yet.',
  'hud.log.xp': '+{n} XP', 'hud.log.kill': 'You defeated a {mob}.',
  'hud.levelup.banner': 'Level {n}',
  'hud.levelup.log': 'You reached level {n}. You have {sp} skill point(s) and {tp} stat points.',
  'hud.target.level': 'Lv {n}', 'hud.target.elite': 'Elite',
  'hud.map.coords': 'x: {x}   z: {z}', 'hud.map.zone.town': 'Town', 'hud.map.zone.field': 'Meadow', 'hud.map.zoomIn': 'Zoom in', 'hud.map.zoomOut': 'Zoom out', 'hud.map.limit': 'This is the limit.', 'hud.map.open': 'Open the big map (M)',
  'hud.cast': 'Casting {name}',

  // skill tree (plan 5.9)
  'tree.title': 'Skills', 'tree.sp': 'Skill points: {n}', 'tree.tp': 'Stat points: {n}', 'tree.tier': 'Tier {n}',
  'tree.reset': 'Reset skills and stats', 'tree.hint': 'Drag a skill onto the hotbar, or select it and press 5 to 9',
  'tree.resetConfirm': 'Reset all skill and stat points? You get them back to spend again.', 'tree.resetYes': 'Reset', 'tree.resetNo': 'Cancel',
  'tree.resetWait': 'You can reset again in {m} min.',
  'tree.line2': '{kind} · {branch} · Tier {tier}', 'tree.line3': 'Mana {mana} · Cooldown {cd} s', 'tree.line3free': 'Always on',
  'tree.needs': 'Learn {name} first', 'tree.needLevel': 'Requires level {n}', 'tree.needPoints': 'Costs {cost} skill point(s). You have {have}.',
  'tree.learned': 'Learned', 'tree.learn': 'Click to learn',
  'tree.branch.linguist': 'Linguist', 'tree.branch.scholar': 'Scholar', 'tree.branch.warden': 'Warden',

  // character panel (plan 5.10)
  'char.title': 'Character', 'char.newcomer': 'Newcomer', 'char.level': 'Level {n} · {branch}',
  'char.stat.voice': 'Voice', 'char.stat.mind': 'Mind', 'char.stat.grit': 'Grit',
  'char.tip.voice': 'Each point: +2% skill damage', 'char.tip.mind': 'Each point: +6 max mana and +1% mana regeneration', 'char.tip.grit': 'Each point: +8 max health',
  'char.maxHp': 'Max health', 'char.maxMana': 'Max mana', 'char.regen': 'Mana regeneration', 'char.crit': 'Critical hit chance', 'char.dmg': 'Damage bonus',
  'char.regenVal': '{n} per second', 'char.left': 'Stat points left: {n}', 'char.add': 'Add a point to {stat}',

  // silk chip (plan 5.12)
  'silk.device': 'Playing locally', 'silk.waiting': '+{n} waiting', 'silk.sync': 'Sync', 'silk.syncing': 'Syncing…',
  'hud.name.default': 'Traveller',
  'silk.tip.gate': 'Silk that counts for the Gate-Loom: {n}', 'silk.tip.chain': 'Recorded on NEAR: {n}', 'silk.tip.pending': 'Waiting to be recorded: {n}',
  'silk.tip.play': 'Play silk (saved on this device only): {n}', 'silk.tip.total': 'All silk you hold: {n}', 'silk.tip.fee': 'Gate price: {n}',
  'silk.tip.help': 'Press Sync to record the waiting silk now. It also syncs by itself every minute.', 'silk.tip.what': 'What is silk?',
  'silk.unit': '{n} silk',
};
