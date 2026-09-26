"""Exercise the maintained extractor without reading a PBF or importing osmium."""
import ast
from pathlib import Path
from types import SimpleNamespace as Obj
import unittest

source = ast.parse(Path(__file__).with_name('extract_smart_zone_public_region.py').read_text(encoding='utf-8'))
names = {'ALLOWED', 'BUILDINGS', 'AMENITIES', 'ROADS'}
definitions = [n for n in source.body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) or
               isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets)]
env = {'osmium': Obj(SimpleHandler=object), 'BOX': (0, 0, 1, 1)}
exec(compile(ast.Module(body=definitions, type_ignores=[]), '<extractor>', 'exec'), env)

def relation(members, **tags):
    return Obj(id=123, version=1, timestamp='2026-09-25T20:24:36Z',
               tags=[Obj(k=k, v=v) for k, v in tags.items()],
               members=[Obj(type='w', ref=ref, role='outer') for ref in members])

class ExtractionTests(unittest.TestCase):
    def test_enclosing_multi_way_exclusion_is_not_dropped(self):
        region = env['Region']()
        region.way_bounds = {1: (-1, -1, 2, -1), 2: (2, -1, 2, 2),
                             3: (-1, 2, 2, 2), 4: (-1, -1, -1, 2)}
        region.relation(relation([1, 2, 3, 4], amenity='school'))
        self.assertEqual(len(region.relations), 1)
        self.assertEqual(region.missing, {1, 2, 3, 4})

    def test_nonoverlapping_exclusion_stays_outside_crop(self):
        region = env['Region']()
        region.way_bounds = {1: (2, 2, 3, 3)}
        region.relation(relation([1], leisure='park'))
        self.assertEqual(region.relations, [])

    def test_unknown_exclusion_is_retained_for_fail_closed_validation(self):
        region = env['Region']()
        region.relation(relation([99], amenity='school'))
        self.assertEqual(region.missing, {99})

    def test_only_maintained_public_tags_enter_output(self):
        result = env['tags'](relation([], amenity='school', name='Private name', phone='private', email='private'))
        self.assertEqual(result, {'amenity': 'school'})
        self.assertTrue(env['selected']({'highway': 'motorway'}, 'way'))
        self.assertTrue(env['selected']({'railway': 'rail'}, 'way'))
        self.assertTrue(env['selected']({'access': 'private'}, 'way'))
        self.assertFalse(env['selected']({'name': 'not a feature'}, 'node'))

    def test_nested_outer_geometry_preserves_hole_roles(self):
        members = [{'type': 'relation', 'ref': 10, 'role': 'outer'}]
        child = [{'type': 'way', 'ref': 1, 'role': 'outer'}, {'type': 'way', 'ref': 2, 'role': 'inner'}]
        self.assertEqual(env['expand_members'](members, {10: child}), child)
        members[0]['role'] = 'inner'
        self.assertEqual([x['role'] for x in env['expand_members'](members, {10: child})], ['inner', 'outer'])

    def test_cycle_or_missing_nested_member_remains_unresolved(self):
        member = {'type': 'relation', 'ref': 10, 'role': 'outer'}
        self.assertEqual(env['expand_members']([member], {10: [member]}), [member])
        self.assertEqual(env['expand_members']([member], {}), [member])

if __name__ == '__main__':
    unittest.main()
