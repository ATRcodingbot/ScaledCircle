import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../services/business_workspace_service.dart';

class BusinessTeamScreen extends StatefulWidget {
  const BusinessTeamScreen({super.key, this.service, this.businessId});
  final BusinessWorkspaceService? service;
  final String? businessId;
  @override
  State<BusinessTeamScreen> createState() => _BusinessTeamScreenState();
}

class _BusinessTeamScreenState extends State<BusinessTeamScreen> {
  late final _service = widget.service ?? BusinessWorkspaceService();
  Map<String, dynamic>? _data;
  String? _error;
  bool _busy = false;
  String get _businessId =>
      widget.businessId ??
      BusinessWorkspaceSession.businessIdFor(
        FirebaseAuth.instance.currentUser!.uid,
      );
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _service.call('getBusinessTeam', {
        'businessId': _businessId,
      });
      if (mounted) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Unable to load Team. Check your access and retry.',
        );
      }
    }
  }

  Future<void> _change(Map<String, dynamic> data) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _service.call('updateBusinessTeamMember', {
        'businessId': _businessId,
        ...data,
      });
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'The team change was not confirmed. Refresh and retry.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editor([Map<String, dynamic>? member]) async {
    final name = TextEditingController(text: member?['name']?.toString() ?? ''),
        email = TextEditingController(text: member?['email']?.toString() ?? '');
    var preset = 'Analyst';
    var grants = Set<String>.from(
      member?['permissions'] as List? ?? businessPresets[preset]!,
    );
    if (member != null) {
      preset =
          businessPresetIds.entries
              .where((e) => e.value == member['preset'])
              .firstOrNull
              ?.key ??
          'Custom';
    }
    final data = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: Text(member == null ? 'Invite Team Member' : 'Edit Access'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: name,
                    enabled: member == null,
                    maxLength: 120,
                    decoration: const InputDecoration(labelText: 'Name'),
                  ),
                  TextField(
                    controller: email,
                    enabled: member == null,
                    maxLength: 254,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Email'),
                  ),
                  DropdownButtonFormField<String>(
                    initialValue: preset,
                    items: businessPresets.keys
                        .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                        .toList(),
                    onChanged: (p) => update(() {
                      preset = p!;
                      grants = Set.from(businessPresets[p]!);
                    }),
                    decoration: const InputDecoration(
                      labelText: 'Responsibilities',
                    ),
                  ),
                  ExpansionTile(
                    title: const Text('Adjust responsibilities'),
                    children: [
                      for (final permission in businessPermissionLabels.entries)
                        CheckboxListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          value: grants.contains(permission.key),
                          title: Text(permission.value),
                          onChanged: (v) => update(() {
                            preset = 'Custom';
                            v == true
                                ? grants.add(permission.key)
                                : grants.remove(permission.key);
                          }),
                        ),
                    ],
                  ),
                  const Text(
                    'Campaign access does not grant permission to spend money. The owner always keeps full access.',
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (name.text.trim().isEmpty || !email.text.contains('@')) {
                  return;
                }
                Navigator.pop(dialog, {
                  'name': name.text.trim(),
                  'email': email.text.trim(),
                  'permissions': grants.toList()..sort(),
                  'preset': businessPresetIds[preset],
                });
              },
              child: Text(member == null ? 'Send Invitation' : 'Save Access'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    email.dispose();
    if (data == null || !mounted) return;
    if (member != null) {
      await _change({'action': 'edit', 'memberId': member['uid'], ...data});
      return;
    }
    setState(() => _busy = true);
    try {
      await _service.call('inviteBusinessTeamMember', {
        'businessId': _businessId,
        ...data,
      });
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Invitation queued for email delivery. The seat is reserved for 7 days.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.toString().contains('resource-exhausted')
                  ? 'No seats are available. Remove a member or upgrade your plan.'
                  : 'Invitation was not confirmed. Refresh Team before retrying.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _status(dynamic value) => switch (value) {
    'active' => 'Active',
    'plan_inactive' => 'Inactive on this plan',
    'removed' => 'Removed',
    'pending' => 'Pending',
    'accepted' => 'Accepted',
    'revoked' => 'Revoked',
    'expired' => 'Expired',
    _ => 'Unavailable',
  };
  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Team')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: _error != null
              ? Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(_error!),
                    FilledButton(onPressed: _load, child: const Text('Retry')),
                  ],
                )
              : data == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    Text(
                      'Team Members',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    Text(
                      '${data['seatsUsed']} of ${data['seatLimit']} seats used',
                    ),
                    if ((data['seatsReserved'] as num? ?? 0) > 0)
                      Text(
                        '${data['seatsReserved']} seat(s) reserved for invitations',
                      ),
                    if ((data['permissions'] as List? ?? []).contains(
                      'teamManagement',
                    )) ...[
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _busy ? null : () => _editor(),
                        icon: const Icon(Icons.person_add_outlined),
                        label: const Text('Invite Team Member'),
                      ),
                    ],
                    ListTile(
                      leading: const Icon(Icons.verified_user_outlined),
                      title: Text(
                        data['owner']?['name']?.toString() ?? 'Owner',
                      ),
                      subtitle: Text(
                        '${data['owner']?['email'] ?? ''}\nOwner · Full workspace access',
                      ),
                    ),
                    for (final raw in data['members'] as List? ?? [])
                      Builder(
                        builder: (context) {
                          final m = Map<String, dynamic>.from(raw as Map);
                          return Card(
                            child: ListTile(
                              title: Text(
                                m['name']?.toString() ?? 'Team member',
                              ),
                              subtitle: Text(
                                '${m['email']}\n${_status(m['status'])} · ${(m['permissions'] as List? ?? []).map((p) => businessPermissionLabels[p] ?? '').join(', ')}',
                              ),
                              isThreeLine: true,
                              trailing:
                                  !(data['permissions'] as List? ?? [])
                                      .contains('teamManagement')
                                  ? null
                                  : PopupMenuButton<String>(
                                      enabled: !_busy,
                                      itemBuilder: (_) => [
                                        const PopupMenuItem(
                                          value: 'edit',
                                          child: Text('Edit Access'),
                                        ),
                                        if (m['status'] != 'removed')
                                          const PopupMenuItem(
                                            value: 'remove',
                                            child: Text('Remove'),
                                          ),
                                      ],
                                      onSelected: (action) async {
                                        if (action == 'edit') {
                                          await _editor(m);
                                          return;
                                        }
                                        final confirmed = await showDialog<bool>(
                                          context: context,
                                          builder: (c) => AlertDialog(
                                            title: const Text(
                                              'Remove team member?',
                                            ),
                                            content: const Text(
                                              'Workspace access ends immediately. Their historical activity stays attributed to them.',
                                            ),
                                            actions: [
                                              TextButton(
                                                onPressed: () =>
                                                    Navigator.pop(c, false),
                                                child: const Text(
                                                  'Keep Member',
                                                ),
                                              ),
                                              FilledButton(
                                                onPressed: () =>
                                                    Navigator.pop(c, true),
                                                child: const Text('Remove'),
                                              ),
                                            ],
                                          ),
                                        );
                                        if (confirmed == true) {
                                          await _change({
                                            'action': 'remove',
                                            'memberId': m['uid'],
                                          });
                                        }
                                      },
                                    ),
                            ),
                          );
                        },
                      ),
                    const SizedBox(height: 24),
                    Text(
                      'Invitations',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    if ((data['invitations'] as List? ?? []).isEmpty)
                      const Text('No invitations yet.'),
                    for (final i in data['invitations'] as List? ?? [])
                      ListTile(
                        title: Text(i['name'].toString()),
                        subtitle: Text(
                          '${i['email']} · ${_status(i['status'])}',
                        ),
                        trailing: i['status'] == 'pending'
                            ? TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => _change({
                                        'action': 'revoke',
                                        'invitationId': i['id'],
                                      }),
                                child: const Text('Revoke'),
                              )
                            : null,
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}
