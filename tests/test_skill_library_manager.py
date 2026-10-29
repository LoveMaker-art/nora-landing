import copy
import functools
import hashlib
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'skill-library/nora-skill-library/scripts/library.py'
spec = importlib.util.spec_from_file_location('library', SCRIPT)
lib = importlib.util.module_from_spec(spec); spec.loader.exec_module(lib)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class ManagerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='nora-skill-manager-test-')
        cls.base = Path(cls.temp.name)
        site = cls.base / 'site'; (site / 'skills').mkdir(parents=True)
        shutil.copytree(ROOT / 'skills/packages', site / 'skills/packages')
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
        cls.url = 'http://127.0.0.1:' + str(cls.server.server_port) + '/skills/'
        cls.data = json.loads((ROOT / 'skills/catalogue.local.json').read_text())
        for s in cls.data['skills']:
            if s.get('package'): s['package']['urls'] = [cls.url + 'packages/' + s['package']['filename']]
        (site / 'skills/catalogue.local.json').write_text(json.dumps(cls.data))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.persona = next(s for s in cls.data['skills'] if s['id'] == 'nora-persona-designer')
        cls.zip = (ROOT / 'skills/packages' / cls.persona['package']['filename']).read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(); cls.temp.cleanup()

    def setUp(self):
        self.temp_home = tempfile.TemporaryDirectory(dir=self.base)
        self.home = Path(self.temp_home.name)
        self.env = dict(os.environ, HERMES_HOME=str(self.home))

    def tearDown(self): self.temp_home.cleanup()

    def cli(self, *args):
        result = subprocess.run([sys.executable, str(SCRIPT), '--local-test', self.url, *args], env=self.env, capture_output=True, text=True)
        value = json.loads(result.stdout); self.assertEqual(result.returncode, 0 if value['ok'] else 1)
        return value

    def test_read_only_catalogue_and_dependencies(self):
        self.assertEqual(len(self.cli('list')['skills']), 7)
        info = self.cli('info', 'sillytavern-control')['skill']
        self.assertIn('st-mcp', info['requirement'])
        self.assertFalse((self.home / 'skills').exists())

    def test_search_and_supported_commands_exclude_submission_actions(self):
        result = self.cli('search','人格')
        self.assertEqual([s['id'] for s in result['skills']],['nora-persona-designer'])
        help_text = subprocess.run([sys.executable,str(SCRIPT),'--help'],capture_output=True,text=True)
        self.assertEqual(help_text.returncode,0)
        self.assertIn('install',help_text.stdout)
        for action in ['submit','submission-status']:
            self.assertNotIn(action,help_text.stdout)
            result = subprocess.run([sys.executable,str(SCRIPT),action],capture_output=True,text=True)
            self.assertEqual(result.returncode,2)
            self.assertIn('invalid choice',result.stderr)

    def test_download_then_install_both_complete_packages(self):
        output = self.cli('download', 'nora-persona-designer', '--output-dir', str(self.home / 'downloads'))
        self.assertEqual(Path(output['path']).read_bytes(), self.zip)
        self.assertFalse((self.home / 'skills').exists())
        for name in ['nora-persona-designer', 'sillytavern-control']:
            result = self.cli('install', name, '--confirm','--files-only')
            self.assertEqual(result['status'], 'installed'); self.assertFalse(result['loaded'])
            item = next(s for s in self.data['skills'] if s['id'] == name)
            data = (ROOT / 'skills/packages' / item['package']['filename']).read_bytes()
            expected = lib.inspect_zip(data, name)
            target = Path(result['path'])
            actual = {p.relative_to(target).as_posix():p.read_bytes() for p in target.rglob('*') if p.is_file()}
            self.assertEqual(actual, expected)
            self.assertEqual(self.cli('install', name, '--confirm','--files-only')['status'], 'already-installed')
        self.assertFalse((self.home / 'SOUL.md').exists())
        self.assertFalse((self.home / 'config.yaml').exists())

    def test_custom_skill_and_download_files_are_preserved(self):
        target = self.home / 'skills/creative/nora-persona-designer'; target.mkdir(parents=True)
        (target / 'SKILL.md').write_text('my custom skill')
        self.assertEqual(self.cli('install', 'nora-persona-designer', '--confirm','--files-only')['code'], 'ALREADY_EXISTS')
        self.assertEqual((target / 'SKILL.md').read_text(), 'my custom skill')
        output = self.home / 'downloads'; output.mkdir(); package = output / self.persona['package']['filename']; package.write_bytes(b'custom')
        self.assertEqual(self.cli('download', 'nora-persona-designer', '--output-dir', str(output))['code'], 'OUTPUT_EXISTS')
        self.assertEqual(package.read_bytes(), b'custom')

    def test_install_requires_authorization_and_current_instance(self):
        self.assertEqual(self.cli('install','nora-persona-designer')['code'],'AUTHORIZATION_REQUIRED')
        self.assertEqual(self.cli('install','nora-persona-designer','--confirm','--hermes-home',str(self.base))['code'],'HOME_MISMATCH')
        self.assertEqual(self.cli('install','tavern','--confirm','--files-only')['code'],'BUNDLED_SKILL')
        self.assertFalse((self.home / 'skills').exists())

    def test_symlink_target_and_busy_install_do_not_overwrite(self):
        creative = self.home / 'skills/creative'; creative.mkdir(parents=True)
        (creative / 'nora-persona-designer').symlink_to(self.base, target_is_directory=True)
        self.assertEqual(self.cli('install','nora-persona-designer','--confirm','--files-only')['code'],'ALREADY_EXISTS')
        (creative / 'nora-persona-designer').unlink()
        lock = self.home / 'skills/.nora-skill-library-install.lock'; lock.write_text('active test owner')
        self.assertEqual(self.cli('install','nora-persona-designer','--confirm','--files-only')['code'],'INSTALL_BUSY')
        self.assertEqual(lock.read_text(),'active test owner')

    def test_catalogue_retries_official_backup_in_order(self):
        client=lib.Client(); calls=[]
        data=json.loads((ROOT/'skills/catalogue.json').read_text())
        def read(url,limit):
            calls.append(url)
            if len(calls)==1: raise lib.Failure('SOURCE_UNAVAILABLE','simulated unavailable')
            return json.dumps(data).encode()
        client.read=read
        result,source=client.catalogue()
        self.assertEqual(calls,client.config['catalogueUrls']);self.assertEqual(source,calls[1]);self.assertEqual(len(result['skills']),7)

    def test_corrupt_primary_package_falls_back_to_same_pinned_file(self):
        client=lib.Client(); item=next(s for s in json.loads((ROOT/'skills/catalogue.json').read_text())['skills'] if s['id']=='nora-persona-designer')
        calls=[]
        def read(url,limit):
            calls.append(url);return b'corrupt' if len(calls)==1 else self.zip
        client.read=read
        data,url,attempts=client.package(item)
        self.assertEqual(calls,item['package']['urls']);self.assertEqual(data,self.zip);self.assertEqual(attempts[0]['code'],'PACKAGE_CHECKSUM')
        self.assertEqual(url,calls[1])

    def test_all_corrupt_or_unavailable_packages_never_install(self):
        client=lib.Client(self.url);client.read=lambda url,limit:b'wrong bytes'
        with self.assertRaises(lib.Failure) as caught: client.package(self.persona)
        self.assertEqual(caught.exception.code,'PACKAGE_UNAVAILABLE')
        self.assertFalse((self.home/'skills').exists())

    def test_untrusted_sources_and_manifest_identity_rejected(self):
        client=lib.Client()
        self.assertFalse(client.allowed('http://jihulab.com/anything'))
        self.assertFalse(client.allowed('https://noratavern.com.evil.example/skills/package.zip'))
        self.assertFalse(client.allowed('https://noratavern.com/skills/packages/a.zip?token=bad'))
        bad=json.loads((ROOT/'skills/catalogue.json').read_text())
        bad['skills'][0]['package']['urls'].reverse()
        with self.assertRaises(lib.Failure):lib.validate_catalogue(bad,client)
        bad=copy.deepcopy(self.data);bad['skills'][0]['package']['filename']='other.zip'
        with self.assertRaises(lib.Failure):lib.validate_catalogue(bad,lib.Client(self.url))

    def test_malicious_zip_paths_links_and_identity_rejected(self):
        for name,mode in [('nora-persona-designer/../../SOUL.md',0o100644),('/absolute',0o100644),('nora-persona-designer/link',0o120777),('nora-persona-designer//bad',0o100644)]:
            with self.subTest(name=name):
                out=io.BytesIO()
                with zipfile.ZipFile(out,'w') as z:
                    z.writestr('nora-persona-designer/SKILL.md','---\nname: nora-persona-designer\n---\n')
                    info=zipfile.ZipInfo(name);info.external_attr=mode<<16;z.writestr(info,'anything')
                with self.assertRaises(lib.Failure):lib.inspect_zip(out.getvalue(),'nora-persona-designer')
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:z.writestr('nora-persona-designer/SKILL.md','---\nname: other-skill\n---\n')
        with self.assertRaises(lib.Failure):lib.inspect_zip(out.getvalue(),'nora-persona-designer')

if __name__=='__main__':unittest.main(verbosity=2)
