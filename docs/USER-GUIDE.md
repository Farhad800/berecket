# Quick guide for each department

Sign in at **https://bereket-fms.vercel.app** with your own username. Your first password is temporary — choose your own. On a phone, tap **Install** (or browser menu → *Add to Home Screen*) to use it like an app. Change language with the globe icon. Everyone can *see* all factory records; buttons appear only for what your role may do. Search any number (order, batch, machine, mold, shipment…) from the box at the top or press **/**.

## Sales & Planning
1. **Customer Orders → New order**: pick the customer, requested delivery date, priority, then add one line per product with quantity. For many products use **Add several products**: tick them all, press *Add*, then type each quantity (Enter jumps to the next box). Up to 500 products per order. *Save & confirm* sends it to planning (or save as draft).
   An order typed by mistake can be removed with **Delete order** as long as nothing has been produced for it; after that, use *Cancel*.
2. **Production Schedule**: open the order's line, choose machine, mold, start/end and quantity. The system warns about machine/mold clashes, machines down, open maintenance, deadline and capacity problems before saving.
3. Changing a delivery date needs a reason; holds and cancellations too. Everything is in the order's history.
4. The order status updates itself as production, QC, the warehouse and shipments progress — no need to change it by hand.

## Production
**Fastest way — Daily entry sheet** (Production Reports → *Daily entry sheet*): every job running or due today on one screen, sorted by machine. Pick the shift, type good and defective pieces for as many jobs as you like (Enter jumps to the next box), tick **Finished** for jobs that are done, then **Save all** once. Planned jobs start automatically; a finished job is closed before the next job on the same machine starts. If one row has a problem (e.g. the machine was reported down), only that row is refused — the others are saved and the problem row stays filled in so you can fix it.

Or job by job:
1. **Production Reports**: open your job → *Start job*.
2. Report good and defective pieces during the shift (*Add quantity*). Start a *New batch* for each lot/pallet run. Mistakes: *Correct a reported quantity…* (adds a correction line with a reason — nothing is erased).
3. Machine problem: *Pause* → reason *Breakdown* → tick *Machine can't run until repaired* → a maintenance request is created for Technical Service automatically. Other stops: *Log stop*.
4. *Complete job* when finished.

## Technical Service
1. **Technical Service → Maintenance requests**: new requests appear here and as notifications. *Start work*, *Waiting for parts*, *Repair completed* (describe the repair). Add photos/PDFs.
2. **Daily service report**: what you did, mold removed/installed and why, spare parts, downtime minutes.
3. **Preventive maintenance** tasks show what is due. **Mold & Machine History** shows every repair, stop and mold change per machine or mold.

## Quality Control
1. **Quality Control → To inspect**: open a batch, tick *Sample inspection* or leave it for a full inspection, enter inspected/accepted/rejected/held pieces and the decision: **Approve, Partial, Hold, Reject**.
2. Hold/Reject needs a defect type and description → a quality issue (NCR) is opened. Held or rejected stock is quarantined in the warehouse automatically and **cannot be shipped**.
3. Record corrective actions on the issue; verify and close it when fixed. A later *Approve* releases the stock again.
4. QC also verifies completed repairs.

## Warehouse
1. **Warehouse Inventory → Awaiting receipt**: count what arrived from production and *Confirm receipt* (location). Held batches go to quarantine.
2. **Customer Shipments → New shipment**: choose the order, enter quantities per approved batch (or *Fill oldest first*). This reserves the stock.
3. When the truck leaves: *Confirm dispatch* → print the **delivery note** with signature boxes. Partial shipments are fine; the order shows *Partially delivered* until everything has gone.
4. Stock corrections (count differences, damage, scrap) need a reason and supervisor permission.

## Management / everyone
- **Dashboard**: live figures — tap any card to open the records behind it.
- **Reports & Analytics**: 15 reports (production, plan vs actual, on-time delivery, downtime, defects, stock, shipments, outstanding quantities…). Pick dates and filters; export to Excel (CSV) or PDF if your role allows.
- **Notifications** (bell): new orders, schedules, breakdowns, critical quality issues, receipts, shipments — only those relevant to your role.
