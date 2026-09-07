import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/stable_dashboard_scroll.dart';

void main() {
  for (final platform in [TargetPlatform.iOS, TargetPlatform.android]) {
    for (final lazy in [true, false]) {
      testWidgets('$platform lazy=$lazy dashboard reverse-scroll lifecycle', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var mounts = 0;
        var taps = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(platform: platform),
            home: Scaffold(
              appBar: AppBar(title: const Text('Dashboard')),
              body: _page(lazy, [
                _Section(onMount: () => mounts++),
                for (var i = 0; i < 12; i++)
                  SizedBox(height: 180, child: Text('Card $i')),
                TextButton(
                  onPressed: () => taps++,
                  child: const Text('Last action'),
                ),
              ]),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final scroll = find.byType(Scrollable);
        expect(scroll, findsOneWidget);
        final state = tester.state<ScrollableState>(scroll);
        expect(state.position.maxScrollExtent, greaterThan(1000));
        for (var i = 0; i < 7; i++) {
          await tester.drag(scroll, const Offset(0, -500));
          await tester.pumpAndSettle();
        }
        await tester.tap(find.text('Last action'));
        await tester.pump();
        expect(taps, 1);
        for (var i = 0; i < 7; i++) {
          await tester.drag(scroll, const Offset(0, 500));
          await tester.pumpAndSettle();
        }
        expect(state.position.pixels, closeTo(0, 0.1));
        expect(mounts, lazy ? greaterThan(1) : equals(1));
        expect(tester.takeException(), isNull);
      });
    }
  }
}

Widget _page(bool lazy, List<Widget> children) => lazy
    ? ListView(padding: const EdgeInsets.all(20), children: children)
    : StableDashboardScroll(
        padding: const EdgeInsets.all(20),
        children: children,
      );

class _Section extends StatefulWidget {
  const _Section({required this.onMount});
  final VoidCallback onMount;
  @override
  State<_Section> createState() => _SectionState();
}

class _SectionState extends State<_Section> {
  @override
  void initState() {
    super.initState();
    widget.onMount();
  }

  @override
  Widget build(BuildContext context) =>
      const SizedBox(height: 400, child: Text('Async section'));
}
