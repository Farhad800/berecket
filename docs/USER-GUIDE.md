# Quick guide for each department

Sign in at **https://bereket-fms.vercel.app** with your own username. Your first password is temporary — choose your own. On a phone, tap **Install** (or browser menu → *Add to Home Screen*) to use it like an app. Change language with the globe icon. Everyone can *see* all factory records; buttons appear only for what your role may do. Search any number (order, batch, machine, mold, shipment…) from the box at the top or press **/**.

## Sales & Planning
1. **Customer Orders → New order**: pick the customer, requested delivery date, priority, then add one line per product with quantity. *Save & confirm* sends it to planning (or save as draft).
2. **Production Schedule**: open the order's line, choose machine, mold, start/end and quantity. The system warns about machine/mold clashes, machines down, open maintenance, deadline and capacity problems before saving.
3. Changing a delivery date needs a reason; holds and cancellations too. Everything is in the order's history.
4. The order status updates itself as production, QC, the warehouse and shipments progress — no need to change it by hand.

## Production
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
