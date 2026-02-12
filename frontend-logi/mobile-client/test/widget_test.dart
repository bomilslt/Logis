import 'package:flutter_test/flutter_test.dart';
import 'package:express_cargo_client/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const ExpressCargoApp());
    await tester.pumpAndSettle();
  });
}
