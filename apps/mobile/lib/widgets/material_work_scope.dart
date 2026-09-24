// Saved quantities are draft inputs, not confirmed inventory or delivery proof.
String materialWorkScopeSummary(Map<String, dynamic> campaign) {
  return 'Entered material quantity: ${campaign['materialQuantity'] ?? "Not entered"}\n'
      'This value does not confirm inventory, a printing order or an approved distribution job. '
      'Distribution scope, pieces per stop and spare allowance are not established by the quantity. '
      'Accessible stops, route, workload and completion requirements still need review before paid work. '
      'No coverage percentage or completed deliveries are inferred.'
      '${campaign['materialFulfillmentType'] == 'no_materials_required' ? "\nSaved fulfillment choice: no physical materials required. Reconcile that choice with any real distribution plan before paid work." : ""}';
}
