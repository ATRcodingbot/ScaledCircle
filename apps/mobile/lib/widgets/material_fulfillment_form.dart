import 'package:flutter/material.dart';

import '../models/material_logistics.dart';
import 'mapped_address_field.dart';

class MaterialFulfillmentForm extends StatefulWidget {
  const MaterialFulfillmentForm({
    super.key,
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.lockMessage,
    this.businessAddress,
    this.businessLatitude,
    this.businessLongitude,
  });

  final MaterialLogisticsDraft value;
  final ValueChanged<MaterialLogisticsDraft> onChanged;
  final bool enabled;
  final String? lockMessage;
  final String? businessAddress;
  final double? businessLatitude;
  final double? businessLongitude;

  @override
  State<MaterialFulfillmentForm> createState() =>
      _MaterialFulfillmentFormState();
}

class _MaterialFulfillmentFormState extends State<MaterialFulfillmentForm> {
  String _formatDateTime(DateTime date) {
    final local = date.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    return '${local.month}/${local.day}/${local.year} $hour:'
        '${local.minute.toString().padLeft(2, '0')} '
        '${local.hour >= 12 ? 'PM' : 'AM'}';
  }

  late final TextEditingController _location;
  late final TextEditingController _printingShop;
  late final TextEditingController _orderReference;
  late final TextEditingController _instructions;

  @override
  void initState() {
    super.initState();
    _location = TextEditingController(text: widget.value.location);
    _printingShop = TextEditingController(text: widget.value.printingShopName);
    _orderReference = TextEditingController(text: widget.value.orderReference);
    _instructions = TextEditingController(text: widget.value.instructions);
  }

  @override
  void didUpdateWidget(MaterialFulfillmentForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync(_location, widget.value.location);
    _sync(_printingShop, widget.value.printingShopName);
    _sync(_orderReference, widget.value.orderReference);
    _sync(_instructions, widget.value.instructions);
  }

  void _sync(TextEditingController controller, String value) {
    if (controller.text != value) controller.text = value;
  }

  @override
  void dispose() {
    _location.dispose();
    _printingShop.dispose();
    _orderReference.dispose();
    _instructions.dispose();
    super.dispose();
  }

  void _emit(MaterialLogisticsDraft next) => widget.onChanged(next);

  Future<DateTime?> _pickDateTime(DateTime? initial) async {
    final now = DateTime.now();
    final base = initial ?? now.add(const Duration(days: 1));
    final date = await showDatePicker(
      context: context,
      initialDate: base,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 3),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
    );
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  String _label(String value) => switch (value) {
    MaterialLogisticsDraft.scalerPickupPrintShop =>
      'Scaler picks up from printing shop',
    MaterialLogisticsDraft.scalerPickupBusiness =>
      'Scaler picks up from my Business',
    MaterialLogisticsDraft.businessDelivery =>
      'I will deliver / drop off materials',
    _ => 'No physical materials required',
  };

  @override
  Widget build(BuildContext context) {
    final value = widget.value;
    final enabled = widget.enabled;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'MATERIAL FULFILLMENT',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            const Text('How will Scalers receive campaign materials?'),
            if (widget.lockMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                widget.lockMessage!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: 14),
            RadioGroup<String>(
              groupValue: value.fulfillmentType,
              onChanged: enabled
                  ? (selected) {
                      if (selected == null) return;
                      final noMaterials =
                          selected ==
                          MaterialLogisticsDraft.noMaterialsRequired;
                      _emit(
                        value.copyWith(
                          fulfillmentType: selected,
                          clearSchedule: noMaterials,
                          clearWindowEnd: noMaterials,
                          clearCoordinates: noMaterials,
                        ),
                      );
                    }
                  : (_) {},
              child: Column(
                children: MaterialLogisticsDraft.supportedTypes
                    .map(
                      (type) => RadioListTile<String>(
                        value: type,
                        enabled: enabled,
                        title: Text(_label(type)),
                      ),
                    )
                    .toList(),
              ),
            ),
            if (value.materialsRequired) ...[
              const SizedBox(height: 8),
              if (value.fulfillmentType ==
                      MaterialLogisticsDraft.scalerPickupBusiness &&
                  widget.businessAddress?.trim().isNotEmpty == true) ...[
                OutlinedButton.icon(
                  key: const Key('use-my-business-address'),
                  onPressed: enabled
                      ? () {
                          final address = widget.businessAddress!.trim();
                          _location.text = address;
                          _emit(
                            value.copyWith(
                              location: address,
                              latitude: widget.businessLatitude,
                              longitude: widget.businessLongitude,
                              clearCoordinates:
                                  widget.businessLatitude == null ||
                                  widget.businessLongitude == null,
                            ),
                          );
                        }
                      : null,
                  icon: const Icon(Icons.business_outlined),
                  label: const Text('Use My Business Address'),
                ),
                const SizedBox(height: 12),
              ],
              if (value.fulfillmentType ==
                  MaterialLogisticsDraft.scalerPickupPrintShop) ...[
                TextFormField(
                  controller: _printingShop,
                  enabled: enabled,
                  decoration: const InputDecoration(
                    labelText: 'Printing shop name',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (text) =>
                      _emit(value.copyWith(printingShopName: text)),
                  validator: (_) {
                    if (value.fulfillmentType ==
                            MaterialLogisticsDraft.scalerPickupPrintShop &&
                        _printingShop.text.trim().isEmpty) {
                      return 'Enter the printing shop name.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 14),
              ],
              MappedAddressField(
                controller: _location,
                enabled: enabled,
                labelText: switch (value.fulfillmentType) {
                  MaterialLogisticsDraft.scalerPickupPrintShop =>
                    'Printing shop pickup address',
                  MaterialLogisticsDraft.scalerPickupBusiness =>
                    'Business pickup location',
                  _ => 'Delivery / meetup location',
                },
                hintText: 'Street, city, state, ZIP',
                allowManualAddress: true,
                onChanged: (text) => _emit(
                  value.copyWith(location: text, clearCoordinates: true),
                ),
                onSelected: (suggestion) => _emit(
                  value.copyWith(
                    location: _location.text,
                    latitude: suggestion.latitude,
                    longitude: suggestion.longitude,
                  ),
                ),
                onManualAccepted: (address) => _emit(
                  value.copyWith(location: address, clearCoordinates: true),
                ),
                validator: (text) => text == null || text.trim().isEmpty
                    ? 'Enter the pickup or delivery location.'
                    : null,
              ),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: enabled
                    ? () async {
                        final selected = await _pickDateTime(value.scheduledAt);
                        if (selected != null) {
                          _emit(value.copyWith(scheduledAt: selected));
                        }
                      }
                    : null,
                icon: const Icon(Icons.schedule),
                label: Text(
                  value.scheduledAt == null
                      ? 'Set pickup / delivery date and time'
                      : 'Starts: ${_formatDateTime(value.scheduledAt!)}',
                ),
              ),
              OutlinedButton.icon(
                onPressed: enabled
                    ? () async {
                        final selected = await _pickDateTime(value.windowEndAt);
                        if (selected != null) {
                          _emit(value.copyWith(windowEndAt: selected));
                        }
                      }
                    : null,
                icon: const Icon(Icons.more_time),
                label: Text(
                  value.windowEndAt == null
                      ? 'Add optional window end'
                      : 'Window ends: ${_formatDateTime(value.windowEndAt!)}',
                ),
              ),
              if (value.fulfillmentType ==
                  MaterialLogisticsDraft.scalerPickupPrintShop) ...[
                const SizedBox(height: 14),
                TextFormField(
                  controller: _orderReference,
                  enabled: enabled,
                  decoration: const InputDecoration(
                    labelText: 'Order / reference instructions',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (text) =>
                      _emit(value.copyWith(orderReference: text)),
                ),
              ],
              const SizedBox(height: 14),
              TextFormField(
                controller: _instructions,
                enabled: enabled,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Pickup / delivery instructions',
                  border: OutlineInputBorder(),
                ),
                onChanged: (text) => _emit(value.copyWith(instructions: text)),
              ),
            ] else
              const Text(
                'No physical handoff or material-receipt proof is required.',
              ),
          ],
        ),
      ),
    );
  }
}
