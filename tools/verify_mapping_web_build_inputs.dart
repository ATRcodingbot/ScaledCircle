// Reads build evidence only. Never builds or deploys.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'file:///C:/Users/Greg/Desktop/App%20Development/flutter/packages/flutter_tools/lib/src/build_system/hash.dart';

void main(List<String> args) {
  if (args.length != 3)
    throw ArgumentError('root build-state result-file required');
  final root = Directory(args[0]).absolute.path;
  final sourcePrefix = '$root\\apps\\mobile\\lib\\';
  final buildState = Directory(args[1]).absolute.path;
  final rows =
      (jsonDecode(File('$buildState/.filecache').readAsStringSync())
              as Map)['files']
          as List;
  final inputs =
      (jsonDecode(File('$buildState/dart2js.stamp').readAsStringSync())
              as Map)['inputs']
          as List;
  final inputSet = inputs
      .whereType<String>()
      .where((p) => p.startsWith(sourcePrefix))
      .toSet();
  final cache = {for (final row in rows) row['path'] as String: row['hash']};
  final missing = inputSet
      .where((p) => !cache.containsKey(p))
      .map((p) => p.substring(root.length + 1))
      .toList();
  final buffer = Uint8List(64 * 1024);
  var checked = 0;
  final mismatches = <String>[];
  for (final path in inputSet) {
    final file = File(path);
    if (!file.existsSync()) {
      missing.add(path.substring(root.length + 1));
      continue;
    }
    final hash = Md5Hash();
    final input = file.openSync();
    var bytes = 0;
    while (bytes < file.lengthSync()) {
      final count = input.readIntoSync(buffer);
      hash.addChunk(buffer, count);
      bytes += count;
    }
    input.closeSync();
    final value = hash
        .finalize()
        .buffer
        .asUint8List()
        .map((v) => v.toRadixString(16).padLeft(2, '0'))
        .join();
    checked++;
    if (value != cache[path]) mismatches.add(path.substring(root.length + 1));
  }
  final result = {
    'sourceFilesChecked': checked,
    'mismatches': mismatches,
    'missingInputs': missing,
    'method':
        'dart2js declared inputs checked against Flutter Md5Hash file cache',
  };
  File(
    args[2],
  ).writeAsStringSync(const JsonEncoder.withIndent('  ').convert(result));
  print(jsonEncode(result));
  if (mismatches.isNotEmpty || missing.isNotEmpty) exitCode = 1;
}
