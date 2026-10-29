"""Opt-in check against an installed Hermes runtime, always using a temporary home."""
import json
import functools
import shutil
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.getenv('NORA_HERMES_TEST_ROOT'),'Set NORA_HERMES_TEST_ROOT to opt in; never targets its home')
class ActivationTests(unittest.TestCase):
 def test_current_downloads_pass_new_skill_validation_and_read_back_in_real_hermes(self):
  with tempfile.TemporaryDirectory(prefix='nora-current-skill-format-test-') as temp:
   home=Path(temp);root=Path(os.environ['NORA_HERMES_TEST_ROOT']).resolve()
   (home/'config.yaml').write_text('{}\n');(home/'SOUL.md').write_text('Keep the existing persona.')
   env=dict(os.environ,HERMES_HOME=str(home),PYTHONDONTWRITEBYTECODE='1',HERMES_PLATFORM='clawchat')
   check='''
import json,sys,zipfile,hashlib
from pathlib import Path
import yaml
sys.path.insert(0,sys.argv[1])
from tools.skill_manager_tool import _validate_frontmatter,_validate_content_size
from tools.skills_tool import _find_all_skills,skill_view
site=Path(sys.argv[2]);home=Path.cwd();config=(home/'config.yaml').read_bytes()
catalogue=json.loads((site/'skills/catalogue.json').read_text())
validated=[]
for item in catalogue['skills']:
 if item['delivery']!='download':continue
 package=item['package'];data=(site/'skills/packages'/package['filename']).read_bytes()
 assert len(data)==package['bytes'] and hashlib.sha256(data).hexdigest()==package['sha256']
 with zipfile.ZipFile(site/'skills/packages'/package['filename']) as archive:
  assert archive.namelist()==[item['id']+'/SKILL.md']
  raw=archive.read(item['id']+'/SKILL.md')
 assert raw==(site/'skills/guides'/item['id']/'SKILL.md').read_bytes()
 text=raw.decode();front=yaml.safe_load(text.split('---',2)[1])
 assert front['name']==item['id'] and front['version']==item['version']
 assert _validate_frontmatter(text,new_skill=True) is None
 assert _validate_content_size(text) is None
 target=home/'skills/creative'/item['id'];target.mkdir(parents=True);(target/'SKILL.md').write_bytes(raw)
 assert any(skill['name']==item['id'] for skill in _find_all_skills())
 detail=json.loads(skill_view(item['id'],preprocess=False))
 assert detail.get('success') and Path(detail['skill_dir']).resolve()==target.resolve()
 assert (target/'SKILL.md').read_bytes()==raw
 validated.append({'id':item['id'],'version':item['version'],'description_characters':len(front['description'])})
assert len(validated)==2
assert (home/'config.yaml').read_bytes()==config
assert (home/'SOUL.md').read_text()=='Keep the existing persona.'
print(json.dumps({'validated':validated,'existing_data_preserved':True}))
'''
   result=subprocess.run([sys.executable,'-B','-c',check,str(root),str(ROOT)],cwd=home,env=env,capture_output=True,text=True,timeout=45)
   self.assertEqual(result.returncode,0,result.stderr)
   self.assertEqual(len(json.loads(result.stdout)['validated']),2)

 def test_downloadable_manager_uses_hermes_top_level_metadata_and_platform_filter(self):
  with tempfile.TemporaryDirectory(prefix='nora-hermes-format-test-') as temp:
   home=Path(temp);root=Path(os.environ['NORA_HERMES_TEST_ROOT']).resolve()
   with zipfile.ZipFile(ROOT/'skills/packages/nora-skill-library-0.3.0.zip') as z:z.extractall(home/'skills/creative')
   (home/'config.yaml').write_text('{}\n')
   env=dict(os.environ,HERMES_HOME=str(home),PYTHONDONTWRITEBYTECODE='1',HERMES_PLATFORM='clawchat')
   check='''
import json,sys
from pathlib import Path
from unittest.mock import patch
import yaml
sys.path.insert(0,sys.argv[1])
from tools.skill_manager_tool import _validate_frontmatter,_validate_content_size
from tools.skills_tool import _find_all_skills,skill_view
from agent.skill_utils import skill_matches_platform
text=(Path('skills/creative/nora-skill-library/SKILL.md')).read_text()
front=yaml.safe_load(text.split('---',2)[1])
assert _validate_frontmatter(text,new_skill=True) is None
assert _validate_content_size(text) is None
assert front['version']=='0.3.0' and front['author']=='Nora Tavern'
assert front['platforms']==['linux','macos','windows']
assert not any(k in front['metadata'] for k in ('version','author','platforms'))
assert front['metadata']['hermes']['tags']
for platform in ('darwin','linux','win32'):
 with patch('agent.skill_utils.sys.platform',platform):assert skill_matches_platform(front)
with patch('agent.skill_utils.sys.platform','unsupported-os'):assert not skill_matches_platform(front)
assert any(s['name']=='nora-skill-library' for s in _find_all_skills())
view=json.loads(skill_view('nora-skill-library',preprocess=False))
assert view['success']
assert set(view['linked_files']['scripts'])=={'scripts/library.py','scripts/activate.py'}
print(json.dumps({'validated':True,'discoverable':True,'readable':True,'platform_filter':True}))
'''
   result=subprocess.run([sys.executable,'-B','-c',check,str(root)],cwd=home,env=env,capture_output=True,text=True,timeout=45)
   self.assertEqual(result.returncode,0,result.stderr)
   self.assertTrue(json.loads(result.stdout)['platform_filter'])

 def test_install_and_enable_preserve_other_settings_in_real_hermes(self):
  import yaml
  with tempfile.TemporaryDirectory(prefix='nora-real-hermes-install-test-') as temp:
   base=Path(temp);home=base/'isolated-home';home.mkdir()
   root=Path(os.environ['NORA_HERMES_TEST_ROOT']).resolve()
   self.assertTrue((root/'tools/skills_tool.py').is_file())
   config={'model':{'default':'preserve-test-model'},'custom_test_setting':{'keep':['unchanged']},'skills':{'disabled':['nora-persona-designer','other-global'],'platform_disabled':{'clawchat':['nora-persona-designer','other-platform'],'telegram':['nora-persona-designer','telegram-only']}}}
   (home/'config.yaml').write_text(json.dumps(config));(home/'SOUL.md').write_text('Keep this test persona unchanged.')
   # Bootstrap the exact downloadable manager, not the source-tree CLI.
   with zipfile.ZipFile(ROOT/'skills/packages/nora-skill-library-0.3.0.zip') as z:z.extractall(home/'skills/creative')
   cli=home/'skills/creative/nora-skill-library/scripts/library.py'
   site=base/'site';(site/'skills').mkdir(parents=True)
   shutil.copytree(ROOT/'skills/packages',site/'skills/packages')
   class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
   server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(site)))
   catalogue=json.loads((ROOT/'skills/catalogue.local.json').read_text())
   for item in catalogue['skills']:
    if item.get('package'):item['package']['urls']=['http://127.0.0.1:'+str(server.server_port)+'/skills/packages/'+item['package']['filename']]
   (site/'skills/catalogue.local.json').write_text(json.dumps(catalogue))
   thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   try:
    env=dict(os.environ,HERMES_HOME=str(home),PYTHONDONTWRITEBYTECODE='1',HERMES_PLATFORM='clawchat')
    args=[sys.executable,'-B',str(cli),'--local-test','http://127.0.0.1:'+str(server.server_port)+'/skills/']
    result=subprocess.run(args+['install','nora-persona-designer','--confirm','--hermes-root',str(root),'--platform','clawchat'],env=env,capture_output=True,text=True,timeout=45)
    value=json.loads(result.stdout);self.assertEqual(result.returncode,0,value);self.assertTrue(value['enabled'])
    self.assertTrue(value['activation']['hermes_visible']);self.assertTrue(value['activation']['hermes_readable']);self.assertFalse(value['activation']['agent_context_loaded'])
    backup=Path(value['activation']['backup']);self.assertEqual(stat.S_IMODE(backup.stat().st_mode),0o600);self.assertEqual(json.loads(backup.read_text()),config)
    saved=yaml.safe_load((home/'config.yaml').read_text())
    self.assertEqual(saved['skills']['disabled'],['other-global'])
    self.assertEqual(saved['skills']['platform_disabled']['clawchat'],['other-platform'])
    self.assertEqual(saved['skills']['platform_disabled']['telegram'],config['skills']['platform_disabled']['telegram'])
    self.assertEqual(saved['model'],config['model']);self.assertEqual(saved['custom_test_setting'],config['custom_test_setting'])
    self.assertEqual((home/'SOUL.md').read_text(),'Keep this test persona unchanged.')
    repeated=subprocess.run(args+['enable','nora-persona-designer','--confirm','--hermes-root',str(root),'--platform','clawchat'],env=env,capture_output=True,text=True,timeout=45)
    result2=json.loads(repeated.stdout);self.assertTrue(result2['ok'],result2);self.assertFalse(result2['config_changed']);self.assertIsNone(result2['backup'])
    missing=subprocess.run(args+['install','sillytavern-control','--confirm','--hermes-root',str(base/'no-runtime')],env=env,capture_output=True,text=True,timeout=45)
    result3=json.loads(missing.stdout);self.assertFalse(result3['ok']);self.assertEqual(result3['status'],'installed_not_enabled');self.assertTrue(Path(result3['path']).is_dir())
   finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main(verbosity=2)
