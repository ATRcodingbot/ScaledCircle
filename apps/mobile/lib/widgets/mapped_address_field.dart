import 'package:flutter/material.dart';

import '../services/address_search_service.dart';

class MappedAddressField extends StatefulWidget {
  const MappedAddressField({
    super.key,
    required this.controller,
    required this.labelText,
    this.hintText,
    this.validator,
    this.onChanged,
    this.onSelected,
    this.enabled = true,
  });

  final TextEditingController controller;
  final String labelText;
  final String? hintText;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged;
  final ValueChanged<AddressSuggestion>? onSelected;
  final bool enabled;

  @override
  State<MappedAddressField> createState() => _MappedAddressFieldState();
}

class _MappedAddressFieldState extends State<MappedAddressField> {
  static final _searchService = AddressSearchService();

  List<AddressSuggestion> _suggestions = const [];
  bool _searching = false;
  String? _error;

  Future<void> _search() async {
    final query = widget.controller.text.trim();
    if (query.isEmpty || _searching) {
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _searching = true;
      _suggestions = const [];
      _error = null;
    });

    try {
      final suggestions = await _searchService.search(query);
      if (!mounted) {
        return;
      }
      setState(() {
        _suggestions = suggestions;
        _error = suggestions.isEmpty
            ? 'No map matches found. Add city, state, or ZIP and try again.'
            : null;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _error = "We couldn't map that area automatically.";
      });
    } finally {
      if (mounted) {
        setState(() {
          _searching = false;
        });
      }
    }
  }

  void _select(AddressSuggestion suggestion) {
    widget.controller.text = suggestion.fullAddress;
    widget.controller.selection = TextSelection.collapsed(
      offset: suggestion.fullAddress.length,
    );
    setState(() {
      _suggestions = const [];
      _error = null;
    });
    widget.onChanged?.call(suggestion.fullAddress);
    widget.onSelected?.call(suggestion);
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          controller: widget.controller,
          enabled: widget.enabled,
          textInputAction: TextInputAction.search,
          keyboardType: TextInputType.streetAddress,
          autofillHints: const [AutofillHints.fullStreetAddress],
          onChanged: (value) {
            widget.onChanged?.call(value);
            if (_suggestions.isNotEmpty || _error != null) {
              setState(() {
                _suggestions = const [];
                _error = null;
              });
            }
          },
          onFieldSubmitted: (_) => _search(),
          validator: widget.validator,
          decoration: InputDecoration(
            labelText: widget.labelText,
            hintText: widget.hintText,
            prefixIcon: const Icon(Icons.location_on_outlined),
            suffixIcon: IconButton(
              style: IconButton.styleFrom(
                splashFactory: NoSplash.splashFactory,
              ),
              tooltip: 'Search map',
              onPressed: widget.enabled ? _search : null,
              icon: _searching
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.manage_search),
            ),
            border: const OutlineInputBorder(),
          ),
        ),
        if (_suggestions.isNotEmpty || _error != null)
          Container(
            margin: const EdgeInsets.only(top: 6),
            decoration: BoxDecoration(
              color: colorScheme.surface,
              border: Border.all(color: colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x1F000000),
                  blurRadius: 12,
                  offset: Offset(0, 5),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: _error != null
                ? Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_error!),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [
                            OutlinedButton(
                              onPressed: _searching ? null : _search,
                              child: const Text('Try Again'),
                            ),
                            TextButton(
                              onPressed: () {
                                widget.controller.clear();
                                setState(() => _error = null);
                              },
                              child: const Text('Choose Another Area'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (
                        var index = 0;
                        index < _suggestions.length;
                        index++
                      ) ...[
                        Theme(
                          data: Theme.of(
                            context,
                          ).copyWith(splashFactory: NoSplash.splashFactory),
                          child: ListTile(
                            dense: true,
                            leading: const Icon(Icons.place_outlined),
                            title: Text(_suggestions[index].primaryText),
                            subtitle: Text(_suggestions[index].secondaryText),
                            onTap: () => _select(_suggestions[index]),
                          ),
                        ),
                        if (index < _suggestions.length - 1)
                          const Divider(height: 1),
                      ],
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 5, 16, 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Icon(
                              Icons.map_outlined,
                              size: 14,
                              color: colorScheme.onSurfaceVariant,
                            ),
                            const SizedBox(width: 5),
                            Text(
                              'Search © OpenStreetMap contributors • Nominatim',
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    color: colorScheme.onSurfaceVariant,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
          ),
      ],
    );
  }
}
