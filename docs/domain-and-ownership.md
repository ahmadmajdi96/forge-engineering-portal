# Domain and ownership

| Record | Authority and identity |
| --- | --- |
| Organization and factory | EMS factory key with an explicit AMS site mapping |
| Building, floor, area, line and station | Spatial containment and stable IDs inside a factory revision |
| Equipment type and placed occurrence | Template version plus per-occurrence placement, local overrides, ports, provenance and linked asset identity |
| Physical serial and commissioned equipment | CMMS identifier and separate device/commissioning evidence |
| Process route | EMS versioned draft with stable step/transition identities, station references, and exact PLMS/RMS references |
| Application, procedure and HMI | Studio app identity in an immutable site workspace revision |
| Terminal and node | Engineering occurrence reference plus independently enrolled device identity |
| Run and operational action | Exact deployed release/configuration with MES/QMS execution context and scoped device evidence |
| Order, inventory and scheduling | OMS orders, WMS stock/lot/location and APS planning facts |
| Identity and authorization | AMS issuer/subject for humans and exact actions by mapped site; edge device keys separately enrolled |

Process sequencing is independent of containment and equipment placement. A geometric move preserves station/terminal identity. Assignments refer to exact site, release digest, context, configuration revision, and effective interval. Design, approvals, installation, planning, execution, and accepted partner transactions retain separate evidence.

Legacy asset names are display data. Import requires approved stable ID crosswalks, including each historical actor and revision. Verify unresolved and duplicate references before any production mapping.
