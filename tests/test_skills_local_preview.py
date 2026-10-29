"""Verify removed submission surfaces and preserved static downloads over real HTTP."""
import functools
import importlib.util
import json
from pathlib import Path
import sys
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('skills_preview',ROOT/'scripts/serve-skills.py')
preview=importlib.util.module_from_spec(spec);spec.loader.exec_module(preview)

class PreviewTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(preview.Handler,directory=str(ROOT)))
  cls.url='http://127.0.0.1:'+str(cls.server.server_port)
  cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
 @classmethod
 def tearDownClass(cls):
  cls.server.shutdown();cls.server.server_close();cls.thread.join()
 def request(self,path,method='GET'):
  req=urllib.request.Request(self.url+path,data=b'{}' if method=='POST' else None,method=method)
  try:response=urllib.request.urlopen(req)
  except urllib.error.HTTPError as e:response=e
  with response:return response.status,response.read()
 def test_removed_routes_and_old_package_are_unavailable_for_get_head_post(self):
  for route in ['/review/','/review/review.js','/api/skills/submissions','/api/skills/submissions/old','/api/review/submissions','/api/skills/web','/skills/submissions.js','/skills/packages/nora-skill-library-0.2.0.zip']:
   for method in ['GET','HEAD','POST']:
    with self.subTest(route=route,method=method):self.assertEqual(self.request(route,method)[0],404)
 def test_catalogue_and_current_packages_remain_downloadable(self):
  status,body=self.request('/skills/');self.assertEqual(status,200)
  self.assertNotIn(b'submission',body);self.assertNotIn(b'review/',body)
  data=json.loads(self.request('/skills/catalogue.local.json')[1]);self.assertEqual(len(data['skills']),7)
  packages=['/skills/packages/'+item['package']['filename'] for item in data['skills'] if item['delivery']=='download']
  self.assertEqual(len(packages),2)
  for route in ['/skills/catalogue.local.json','/skills/library.js','/skills/packages/nora-skill-library-0.3.0.zip',*packages]:
   self.assertEqual(self.request(route)[0],200)

if __name__=='__main__':unittest.main(verbosity=2)
