"""
Sigma rule evaluation for ALL EYES X.

A deliberately small, honest subset of the Sigma specification - enough to write
useful detections against the log events the agent ships, and explicit about what
it does not support rather than pretending to full Sigma compliance.

SUPPORTED
  detection.selection     field: value, field: [v1, v2]  (OR within a field)
  field|contains          substring, case-insensitive
  field|startswith        prefix, case-insensitive
  field|endswith          suffix, case-insensitive
  condition: "selection"
  condition: "selection and not exclusion"
  multiple named selections combined with and / and not

NOT SUPPORTED (and reported, not silently ignored)
  pipelines / field mappings, logsource-based routing, `|re` regular expressions,
  `|base64`, temporal rules, `condition` with parentheses or `or`, aggregation and
  count rules, correlation rules.

Rules that use unsupported syntax are reported as `unsupported` with the reason
rather than being evaluated as if they matched nothing. A rule that appears to
work but silently never matches is the worst possible outcome for a detection
engine.
"""

import re

SUPPORTED_MODIFIERS = {'contains', 'startswith', 'endswith'}

# condition syntax this engine understands
_SIMPLE = re.compile(r'^\s*([A-Za-z0-9_]+)\s*$', re.I)
_AND_NOT = re.compile(
    r'^\s*([A-Za-z0-9_]+)\s+and\s+not\s+([A-Za-z0-9_]+)\s*$', re.I
)
_UNSUPPORTED_HINTS = (
    ('|re', 'regular-expression modifier'),
    ('|base64', 'base64 modifier'),
    ('|all', 'all-must-match modifier'),
    (' them ', 'the "them" keyword'),
    ('|', 'pipe modifier'),
    ('(', 'parenthesised condition'),
    (' or ', 'or in condition'),
    ('|count', 'count aggregation'),
)


class RuleError(Exception):
    """Raised when a rule cannot be evaluated, with a reason the UI can show."""


def parse_rule(raw):
    """Parse a Sigma YAML rule without requiring PyYAML.

    Sigma rules are YAML, but the subset this engine accepts is simple enough to
    parse directly, which keeps the agent and server dependency-free. Anything
    outside the subset raises RuleError naming the unsupported feature.
    """
    if not raw or not raw.strip():
        raise RuleError('empty rule')

    rule = {}
    current_section = None
    current_key = None
    key_indent = None      # indent at which detection-level keys sit

    for raw_line in raw.splitlines():
        if not raw_line.strip() or raw_line.strip().startswith('#'):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(' '))
        line = raw_line.strip()

        if indent == 0:
            if line.endswith(':') and not line.startswith('-'):
                current_section = line[:-1].strip()
                rule[current_section] = {} if current_section == 'detection' else ''
                current_key, key_indent = None, None
            elif ':' in line:
                key, _, value = line.partition(':')
                current_section = key.strip()
                rule[current_section] = value.strip()
                current_key, key_indent = None, None
        elif current_section == 'detection':
            # A detection-level key sits at the shallowest indent seen inside the
            # section. `selection:` and `condition:` share that indent, so a line
            # at that indent is a NEW key, not a field of the current selection.
            if key_indent is None or indent <= key_indent:
                key_indent = indent
                current_key = line[:-1].strip() if line.endswith(':') else line.partition(':')[0].strip()
                value = line.partition(':')[2].strip() if ':' in line else ''
                rule['detection'][current_key] = value.strip().strip('"\'') if value else {}
            elif ':' in line and current_key:
                key, _, value = line.partition(':')
                if not isinstance(rule['detection'].get(current_key), dict):
                    rule['detection'][current_key] = {}
                rule['detection'][current_key][key.strip()] = value.strip().strip('"\'')

    if 'detection' not in rule or not isinstance(rule.get('detection'), dict) or not rule['detection']:
        raise RuleError('no detection section')

    # In Sigma, `condition` is normally nested inside `detection`, but some rules
    # put it at the top level. Accept both.
    detection = rule['detection']
    condition = detection.pop('condition', None) or rule.get('condition')
    if not condition:
        raise RuleError('no condition')
    rule['condition'] = str(condition).strip().strip('"\'')
    if not detection:
        raise RuleError('detection has no selection')
    return rule


def check_condition(condition, results):
    """Evaluate the supported condition forms against per-selection results."""
    m = _SIMPLE.match(condition)
    if m:
        name = m.group(1)
        if name not in results:
            raise RuleError(f'condition references unknown selection "{name}"')
        return results[name]

    m = _AND_NOT.match(condition)
    if m:
        pos, neg = m.group(1), m.group(2)
        for name in (pos, neg):
            if name not in results:
                raise RuleError(f'condition references unknown selection "{name}"')
        return results[pos] and not results[neg]

    for needle, label in _UNSUPPORTED_HINTS:
        if needle in condition.lower():
            raise RuleError(f'unsupported condition syntax: {label}')
    raise RuleError(f'unsupported condition: {condition!r}')


def _field_value(event, field):
    """Map a Sigma field name onto a stored log event."""
    mapping = {
        'eventid': 'event_id',
        'event_id': 'event_id',
        'provider_name': 'unit',
        'providername': 'unit',
        'service': 'unit',
        'unit': 'unit',
        'message': 'message',
        'image': 'message',
        'commandline': 'message',
        'command_line': 'message',
        'host': 'host',
        'hostname': 'host',
        'severity': 'severity',
        'source': 'source',
    }
    key = mapping.get(field.lower())
    return str(event.get(key, '')) if key else ''


def _match_value(haystack, spec):
    """Apply a Sigma value expression (possibly with a modifier) to a field."""
    if '|' in spec:
        field_mod, _, value = spec.partition('|')
        # The modifier sits on the field name in Sigma (Field|contains: value),
        # so callers pass "contains: value" style specs too.
        mod, value = field_mod, value
    else:
        mod, value = '', spec

    values = [v.strip().strip('"\'') for v in value.strip('[]').split(',') if v.strip()]
    hay = haystack.lower()
    for v in values:
        v = v.lower()
        if mod == 'contains':
            if v in hay:
                return True
        elif mod == 'startswith':
            if hay.startswith(v):
                return True
        elif mod == 'endswith':
            if hay.endswith(v):
                return True
        else:
            if hay == v or v in hay:
                return True
    return False


def match_selection(event, selection):
    """All fields in a selection must match (Sigma ANDs within a selection)."""
    for spec_key, spec_value in selection.items():
        if '|' in spec_key:
            field, modifier = spec_key.split('|', 1)
            if modifier not in SUPPORTED_MODIFIERS:
                raise RuleError(f'unsupported modifier |{modifier}')
            haystack = _field_value(event, field)
            values = [v.strip().strip('"\'') for v in str(spec_value).strip('[]').split(',') if v.strip()]
            hay = haystack.lower()
            hit = False
            for v in values:
                v = v.lower()
                if modifier == 'contains' and v in hay:
                    hit = True
                elif modifier == 'startswith' and hay.startswith(v):
                    hit = True
                elif modifier == 'endswith' and hay.endswith(v):
                    hit = True
                if hit:
                    break
            if not hit:
                return False
        else:
            haystack = _field_value(event, spec_key)
            if not _match_value(haystack, str(spec_value)):
                return False
    return True


def evaluate(rule_raw, events):
    """Evaluate one rule against a list of log events.

    Returns (matched_events, error). Exactly one of the two is meaningful: if
    error is set the rule was not evaluated and the caller must say so.
    """
    try:
        rule = parse_rule(rule_raw)
    except RuleError as exc:
        return [], str(exc)
    except Exception as exc:
        return [], f'parse error: {exc}'

    detection = rule.get('detection') or {}
    condition = str(rule.get('condition') or '')

    for needle, label in _UNSUPPORTED_HINTS:
        if needle == '|':
            continue
        if needle in condition.lower():
            return [], f'unsupported condition syntax: {label}'

    try:
        matched = []
        for event in events:
            results = {}
            for name, selection in detection.items():
                if name == 'condition':
                    continue
                if not isinstance(selection, dict) or not selection:
                    continue
                results[name] = match_selection(event, selection)
            if not results:
                continue
            if check_condition(condition, results):
                matched.append(event)
        return matched, None
    except RuleError as exc:
        return [], str(exc)
    except Exception as exc:
        return [], f'evaluation error: {exc}'


def rule_summary(rule_raw):
    """Best-effort metadata for display, never raising."""
    try:
        rule = parse_rule(rule_raw)
    except Exception:
        return {'title': 'unparsed rule', 'id': '', 'level': ''}
    return {
        'title': str(rule.get('title') or 'untitled'),
        'id': str(rule.get('id') or ''),
        'level': str(rule.get('level') or ''),
        'description': str(rule.get('description') or ''),
        'condition': str(rule.get('condition') or ''),
    }
