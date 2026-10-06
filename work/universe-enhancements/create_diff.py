from pathlib import Path
from difflib import unified_diff
import json

workspace = Path(__file__).resolve().parents[2]
universe = Path(r'C:/path/to/music-universe')
output = workspace / 'work/universe-enhancements'
backup = output / 'backup/universe'
new_files = [
    'src/lib/universeExperience.ts', 'src/lib/audioReactivity.ts',
    'src/lib/cameraMotion.ts', 'src/lib/interactionQuality.ts',
    'src/hooks/useAudioAnalysis.ts', 'src/hooks/useReducedMotion.ts',
    'src/hooks/useInteractionActivity.ts', 'src/components/UniverseExperienceControls.tsx',
    'src/universe-experience.css', 'tests/universeExperience.test.ts',
    'tests/audioReactivity.test.ts', 'tests/cameraMotion.test.ts',
    'tests/interactionQuality.test.ts', 'tests/anchorReturn.test.ts',
    'tests/universe-fixture.mjs', 'tests/universe-experience.mjs',
    'UNIVERSE_ENHANCEMENTS.md',
]
existing = [str(path.relative_to(backup)).replace('\\', '/') for path in backup.rglob('*') if path.is_file()]
patch, changes = [], []
for relative in sorted(set(existing + new_files)):
    old_file, new_file = backup / relative, universe / relative
    old = old_file.read_text(encoding='utf-8-sig').splitlines(keepends=True) if old_file.exists() else []
    new = new_file.read_text(encoding='utf-8-sig').splitlines(keepends=True) if new_file.exists() else []
    if old == new:
        continue
    patch.extend(unified_diff(old, new, fromfile='a/' + relative if old_file.exists() else '/dev/null', tofile='b/' + relative))
    changes.append({'path': relative, 'kind': 'modified' if old_file.exists() else 'added'})
(output / 'scoped.patch').write_text(''.join(patch), encoding='utf-8')
(output / 'changed-files.json').write_text(json.dumps(changes, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'files': len(changes), 'patch': str(output / 'scoped.patch')}, ensure_ascii=False))
