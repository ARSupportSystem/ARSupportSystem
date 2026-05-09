# AR Support System Design and Security Rationale

## Architecture

```text
Maintenance user
  -> React/Vite frontend
  -> FastAPI REST API
  -> SQLAlchemy models
  -> SQLite/PostgreSQL database

AR camera iframe
  -> marker scan event
  -> React workflow state
  -> authenticated API request
  -> fault, annotation, marker, or tool-session record
```

The frontend is deliberately split into operational workspaces: fault scanning, marker administration, tool management, and monitoring. The backend exposes separate endpoint groups for authentication, faults, markers, annotations, tools, analytics, and audit logs. This keeps the AR interface focused on field tasks while supervisors can still inspect system state from the monitoring dashboard.

## AR UX Rationale

The AR workflow is designed for maintenance staff who may be using a phone in a noisy or time-pressured environment. The fault flow is presented as `Scan -> Confirm -> Annotate -> Save`, so the user always knows whether they are identifying a marker, checking an existing record, adding contextual AR notes, or committing a new report. The tool-check flow is `Start -> Scan -> Sign off -> Summary`, which separates physical scanning from formal accountability. AR status messages use `aria-live` so screen-reader users receive the same scan feedback as sighted users, and the UI avoids relying on colour alone by pairing severity and checklist states with visible text.

## Security Controls and Threat Awareness

The system assumes three main threat sources: external credential attacks, unauthorised internal access, and operational tampering with fault or tool records. JWT authentication, role-based access control, rate-limited login, and revoked-token tracking reduce unauthorised access risk. Marker and fault validation reduce accidental or malicious marker reuse. Audit events are written for critical actions including fault creation, marker creation/upload, annotation creation, tool creation/update, tool actions, and tool-session completion.

Tool-session sign-off is treated as a security-relevant control because missing tools can become a physical safety risk. The backend now treats omitted return counts as missing rather than silently accepting an incomplete payload. Incomplete sessions remain visible to monitoring so supervisors can investigate.

## Trade-Offs

Marker registry validation adds administration work, but it prevents arbitrary marker IDs from being used to create untraceable fault records. Role gating keeps technicians productive while reserving marker and user administration for privileged roles. The audit trail is append-only through the API, which is simpler than cryptographic tamper proofing but still gives clear accountability evidence for the coursework scope.

## Security Testing Checklist

- Verify failed-login rate limiting records `LOGIN_FAILED` and `BRUTE_FORCE_SUSPECTED` events.
- Confirm technicians cannot edit or delete another user's tools or private tool sessions.
- Confirm only admins can create, bulk-create, upload, or update markers.
- Create a fault and verify a `FAULT_CREATED` audit event records actor, marker, severity, and resource ID.
- Upload marker images and verify `MARKER_IMAGE_UPLOADED` events record actor and generated marker IDs.
- Complete a tool session with a missing or omitted item and verify status becomes `incomplete`.
- Review monitoring as admin and confirm the audit feed shows actor identity, resource type, resource ID, and timestamp.
- Check the AR page with keyboard focus and a screen reader to confirm scan and validation messages are announced.
