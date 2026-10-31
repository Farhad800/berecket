"""Employee Management (owner, 31 Oct 2026): the owner's acceptance list 1–45 (46–51 = the other suites + phone layout).
EMPTY database. Fresh bereket_accept on :3001 (see TESTING.md), then: python3 tests/e2e/employees.py
Attendance days are in the current month (days 1–8), so run it on day 9 or later of a month."""
import os, re, subprocess, sys
from playwright.sync_api import sync_playwright
B=os.environ.get("BASE","http://localhost:3001"); DB=os.environ.get("PGDB","bereket_accept"); TOKEN=os.environ.get("SETUP_TOKEN","acceptance-setup-token-2026")
OUT=os.environ.get("OUT","/tmp")
PW="OwnerPass2026!"
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n, flush=True)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
Q=lambda s: s.replace('"','\\"')
W=Q('"Worker"')
def login(pg,u,pw):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
def wid(name): return sql(f"SELECT id FROM {W} WHERE {Q('\"fullName\"')}='{name}' ORDER BY {Q('\"createdAt\"')} DESC LIMIT 1")

yr,mo,today=sql("SELECT to_char(now() AT TIME ZONE 'Asia/Baghdad','YYYY|MM|DD')").split("|")
M=f"{yr}-{mo}"; D=lambda d: f"{M}-{d:02d}"

with sync_playwright() as p:
    br=p.chromium.launch(); errs=[]
    def ctx(**kw):
        pg=br.new_context(**({"viewport":{"width":1366,"height":900}}|kw)).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); return pg
    A=ctx()
    A.goto(B+"/setup"); A.fill("#token",TOKEN); A.fill("#employeeId","0001"); A.fill("#fullName","Factory Owner"); A.fill("#username","owner")
    A.fill("#password",PW); A.fill("#confirm",PW); A.click("button[type=submit]"); A.wait_for_url("**/dashboard", wait_until="commit")
    pw={}; U={}
    for eid,name,user,role in [("2001","Leader One","lead1","Team Leader"),("2002","Leader Two","lead2","Team Leader"),("2003","Leader Three","lead3","Team Leader"),("2004","Amal Accountant","acct","Accountant"),("2005","Mazin Manager","mgr","Manager")]:
        A.goto(B+"/admin?tab=employees"); A.click("text=New employee"); A.fill("#employeeId",eid); A.fill("#fullName",name); A.fill("#username",user)
        A.select_option("#roleId", label=role); A.select_option("#departmentId", label="Production"); A.click("form button[type=submit]")
        A.wait_for_selector("text=Temporary password"); temp=A.locator("code").nth(1).inner_text()
        pg=ctx(); login(pg,user,temp); pw[user]=f"{user.capitalize()}Factory2026"
        pg.fill("#current",temp); pg.fill("#next",pw[user]); pg.fill("#confirm",pw[user]); pg.click("button[type=submit]"); pg.wait_for_url("**/dashboard", wait_until="commit"); U[user]=pg

    # ── Employee management (1–6)
    def add_worker(name, shift, phone, start=f"{M}-01", salary=None, expect_match=False):
        A.goto(B+"/workers/new"); A.wait_for_load_state("networkidle")
        A.get_by_label("Full name").fill(name); A.get_by_label("Shift", exact=True).select_option(label=f"Shift {shift}")
        if salary: A.get_by_label("Monthly salary (IQD)").fill(str(salary))
        A.get_by_label("Start date").fill(start); A.get_by_label("Phone number").fill(phone)
        A.get_by_role("button", name="Add employee").last.click(); A.wait_for_timeout(1500)
        if expect_match: return A.inner_text("main")
        A.wait_for_url(re.compile(r".*/workers/c[a-z0-9]+\?saved=1$")); return A.inner_text("main")
    A.goto(B+"/workers/new"); A.wait_for_load_state("networkidle")
    ck("1. add form has exactly the five fields (name, shift, salary, start date, phone)", all(A.get_by_label(x, exact=True).count()==1 for x in ["Full name","Shift","Monthly salary (IQD)","Start date","Phone number"]) and A.locator("main input:not([type=checkbox]), main select").count()==5)
    ck("2. salary starts at 400,000 IQD", A.get_by_label("Monthly salary (IQD)").input_value()=="400000")
    out=add_worker("Ahmad Kareem","1","0750 100 0001")
    ck("1. employee added with an automatic number W-0001 and 400,000 IQD", sql(f"SELECT number||'|'||salary::int||'|'||shift FROM {W} WHERE {Q('\"fullName\"')}='Ahmad Kareem'")=="W-0001|400000|A" and "W-0001" in out)
    for n,ph in [("Mohammed Saleh","0750 100 0002"),("Ali Hasan","0750 100 0003"),("Hasan Omar","0750 100 0004"),("Karwan Aziz","0750 100 0005"),("Sherzad Ali","0750 100 0006")]: add_worker(n,"1",ph)
    add_worker("Rich Salary","1","0750 100 0007", salary=600000)
    add_worker("Late Starter","1","0750 100 0008", start=D(10))
    add_worker("Ziyad Two","2","0750 200 0001"); add_worker("Bawar Three","3","0750 300 0001")
    # the rest of shift 1 (unlimited): 18 more straight into the list
    vals=",".join(f"('fill{i:04d}','W-9{i:03d}','Filler {i:02d}','0770 900 {i:04d}','770900{i:04d}','A',400000,'{M}-01','ACTIVE','x',now())" for i in range(1,18))
    sql(f"INSERT INTO {W} (id,number,{Q('\"fullName\"')},phone,{Q('\"phoneKey\"')},shift,salary,{Q('\"startDate\"')},status,{Q('\"createdById\"')},{Q('\"updatedAt\"')}) VALUES {vals}")
    A.goto(B+"/workers")
    ck(f"4. unlimited: shift 1 holds 25 active employees ({A.get_by_test_id('count-1').inner_text()})", A.get_by_test_id("count-1").inner_text()=="25")
    ck("5. employees in all three shifts", A.get_by_test_id("count-2").inner_text()=="1" and A.get_by_test_id("count-3").inner_text()=="1")
    # leaders
    for s,u in [(1,"Leader One"),(2,"Leader Two"),(3,"Leader Three")]:
        A.goto(B+"/workers/shifts"); A.get_by_test_id(f"shift-{s}").get_by_role("button", name="Change leader").click()
        A.get_by_test_id(f"shift-{s}").get_by_label("Team leader").select_option(label=f"{u} (Team Leader)"); A.get_by_test_id(f"shift-{s}").get_by_role("button", name="Save").click(); A.wait_for_timeout(1200)
    A.goto(B+"/workers/shifts"); ck("each shift has its own team leader", [A.get_by_test_id(f"leader-{s}").inner_text() for s in (1,2,3)]==["Leader One","Leader Two","Leader Three"])
    # 6. transfer: Sherzad from shift 1 to shift 2 (and back later is not needed)
    A.goto(B+f"/workers/{wid('Sherzad Ali')}"); A.get_by_role("button", name="Move to another shift").click(); A.get_by_label("New shift").select_option(label="Shift 2"); A.get_by_role("button", name="Move to another shift").last.click(); A.wait_for_timeout(1200)
    ck("6. transferred to shift 2, with the move kept in history", sql(f"SELECT shift FROM {W} WHERE {Q('\"fullName\"')}='Sherzad Ali'")=="B" and "Moved from shift 1 to shift 2" in A.inner_text("main"))
    # 3. salary: administrator only
    A.goto(B+f"/workers/{wid('Hasan Omar')}"); A.get_by_role("button", name="Change salary").click(); A.get_by_label("New monthly salary (IQD)").fill("450000"); A.get_by_label("Reason").fill("good work"); A.get_by_role("button", name="Save").last.click(); A.wait_for_timeout(1200)
    ck("3. administrator changed a salary; old and new kept with the reason", sql(f"SELECT {Q('\"oldSalary\"')}::int||'>'||{Q('\"newSalary\"')}::int||'|'||reason FROM {Q('\"WorkerSalaryChange\"')}")=="400000>450000|good work" and "worker.salary" in sql(f"SELECT string_agg(action,',') FROM {Q('\"AuditLog\"')}"))
    L1,L2,L3,AC,MG=U["lead1"],U["lead2"],U["lead3"],U["acct"],U["mgr"]
    # (400,000 appears in the page's translation texts as the default, so check a salary that is only data: Hasan's 450,000)
    L1.goto(B+f"/workers/{wid('Hasan Omar')}"); html=L1.content()
    ck("3. team leader: no salary on the page (not even hidden in the HTML), no Change salary", "450,000" not in html and "450000" not in html and L1.get_by_test_id("worker-salary").count()==0 and L1.get_by_role("button", name="Change salary").count()==0)
    L1.goto(B+"/workers"); html=L1.content(); ck("…nor in the employee list", "450000" not in html and "450,000" not in html and "600000" not in html and "600,000" not in html)
    AC.goto(B+f"/workers/{wid('Ahmad Kareem')}"); ck("3. accountant sees the salary but can't change it", AC.get_by_test_id("worker-salary").count()==1 and AC.get_by_role("button", name="Change salary").count()==0)
    L1.goto(B+"/workers/payroll"); ck("team leader can't open payroll (server refuses)", "/forbidden" in L1.url)
    L1.goto(B+f"/print/salary-sheet?year={yr}&month={int(mo)}&shift=A"); ck("…nor the salary sheet by direct link", "/forbidden" in L1.url)
    L2.goto(B+f"/workers/{wid('Ahmad Kareem')}"); L2.wait_for_load_state("networkidle"); body=L2.inner_text("body")
    ck(f"team leader can't open another shift's employee ({body[:80]!r})", ("not found" in body.lower() or "could not be found" in body.lower()) and "Ahmad Kareem" not in body)
    L2.goto(B+"/workers"); ck("team leader sees only their shift's employees", "Ziyad Two" in L2.inner_text("main") and "Sherzad Ali" in L2.inner_text("main") and "Ahmad Kareem" not in L2.inner_text("main"))

    # ── Attendance (7–14)
    def open_att(pg, shift, day): pg.goto(B+f"/workers/attendance?shift={shift}&day={day}"); pg.wait_for_load_state("networkidle")
    def mark(pg, number, what, reason=None):
        row=pg.get_by_test_id(f"att-{number}"); row.get_by_role("button", name=what, exact=True).click()
        if reason: row.get_by_label(f"{number} Reason for the excuse").fill(reason)
    def submit(pg): pg.get_by_role("button", name="Submit attendance").click(); pg.wait_for_timeout(1800)
    num=lambda n: sql(f"SELECT number FROM {W} WHERE {Q('\"fullName\"')}='{n}'")
    open_att(L1,"A",D(5))
    ck(f"7. the report loads the 23 active employees of shift 1 (Sherzad moved, Late Starter not started) ({L1.locator('[data-testid^=att-W-]').count()})", L1.locator("[data-testid^=att-W-]").count()==23)
    L1b=ctx(); login(L1b,"lead1",pw["lead1"]); open_att(L1b,"A",D(5))  # a second tab for the duplicate test
    mark(L1,num("Ahmad Kareem"),"Absent"); mark(L1,num("Mohammed Saleh"),"Excused","family funeral"); mark(L1,num("Ali Hasan"),"Absent")
    ck("8. only the absent ones are marked: 20 present · 2 absent · 1 excused · 23", "Present 20 · Absent 2 · Excused 1 · Total 23" in L1.inner_text("main"))
    submit(L1)
    R=Q('"AttendanceRecord"')
    st=lambda n,d: sql(f"SELECT status||coalesce('/'||{Q('\"excuseState\"')},'') FROM {R} WHERE {Q('\"workerId\"')}='{wid(n)}' AND day='{d}'")
    ck("9. unmarked employees recorded Present (20)", sql(f"SELECT count(*) FROM {R} WHERE day='{D(5)}' AND status='PRESENT'")=="20")
    ck("10. ordinary absences recorded", st("Ahmad Kareem",D(5))=="ABSENT" and st("Ali Hasan",D(5))=="ABSENT")
    ck("11. excused absence recorded, waiting for approval", st("Mohammed Saleh",D(5))=="EXCUSED/WAITING")
    mark(L1b,num("Karwan Aziz"),"Absent"); submit(L1b)
    ck("12. a second report for the same shift and day is refused", "already submitted" in L1b.inner_text("main") and sql(f"SELECT count(*) FROM {Q('\"AttendanceReport\"')} WHERE day='{D(5)}'")=="1")
    open_att(L1,"A",D(4))
    ck("13. a day without a report shows Not Submitted (no records created)", L1.get_by_test_id("missing-1-4").count()==1 and "Not Submitted" in L1.inner_text("main") and sql(f"SELECT count(*) FROM {R} WHERE day='{D(4)}'")=="0")
    # 14. correction with reason: Ali was not absent
    open_att(L1,"A",D(5)); L1.get_by_text("Correct this report").click()
    L1.get_by_test_id(f"att-{num('Ali Hasan')}").get_by_role("button", name="Absent", exact=True).click()
    L1.get_by_label("Why is the report corrected?").fill("Ali came late, he was here"); L1.get_by_role("button", name="Save correction").click(); L1.wait_for_timeout(1800)
    ck("14. corrected: Ali present; history keeps old and new with the reason", st("Ali Hasan",D(5))=="PRESENT" and sql(f"SELECT count(*) FROM {Q('\"AuditLog\"')} WHERE action='attendance.correct' AND reason='Ali came late, he was here' AND before::text LIKE '%ABSENT%' AND after::text LIKE '%PRESENT%'")=="1")
    # more days: Ahmad absent again on day 6; Karwan absent day 6; Rich Salary absent day 6
    open_att(L1,"A",D(6)); mark(L1,num("Ahmad Kareem"),"Absent"); mark(L1,num("Karwan Aziz"),"Absent"); mark(L1,num("Rich Salary"),"Absent"); submit(L1)
    for d in (1,2,3,7,8): open_att(L1,"A",D(d)); submit(L1)
    # 17. extra deduction day on Ahmad's day-6 absence: leader asks, admin approves
    rec=sql(f"SELECT id FROM {R} WHERE {Q('\"workerId\"')}='{wid('Ahmad Kareem')}' AND day='{D(6)}'")
    L1.goto(B+f"/workers/{wid('Ahmad Kareem')}"); L1.locator("li", has=L1.get_by_text(D(6), exact=True)).get_by_role("button", name="Count as more days").click()
    L1.get_by_label("Extra deduction days").fill("1"); L1.get_by_label("Reason").fill("second absence this week"); L1.get_by_role("button", name="Send for approval").click(); L1.wait_for_timeout(1200)
    L1.goto(B+f"/workers/{wid('Ahmad Kareem')}"); L1.locator("li", has=L1.get_by_text(D(6), exact=True)).get_by_role("button", name="Count as more days").count()
    A.goto(B+"/workers/excuses"); A.get_by_test_id("waiting-extra").get_by_role("button", name="Approve").click(); A.wait_for_timeout(1200)
    A.goto(B+"/workers/excuses"); A.get_by_test_id("waiting-excuse").get_by_role("button", name="Approve").click(); A.wait_for_timeout(1200)
    ck("17. extra deduction day approved, recorded apart from attendance (still one absence record that day)", sql(f"SELECT days||'|'||state FROM {Q('\"ExtraDeduction\"')} WHERE {Q('\"recordId\"')}='{rec}'")=="1|APPROVED" and sql(f"SELECT count(*) FROM {R} WHERE {Q('\"workerId\"')}='{wid('Ahmad Kareem')}' AND day='{D(6)}'")=="1")
    ck("excuse approved by the administrator", st("Mohammed Saleh",D(5))=="EXCUSED/APPROVED")
    # 20. penalties: Ahmad 10,000; Karwan 5,000 + 2,500 (several)
    def penalty(pg, name, amount, reason, day):
        pg.goto(B+"/workers/penalties"); f=pg.get_by_test_id("penalty-form")
        f.get_by_label("Employee").select_option(label=f"{name} · {num(name)} · Shift 1"); f.get_by_label("Amount (IQD)").fill(str(amount)); f.get_by_label("Date").fill(day); f.get_by_label("Reason").fill(reason)
        f.get_by_role("button", name="Save penalty").click(); pg.wait_for_timeout(1300)
    penalty(L1,"Ahmad Kareem",10000,"broke a mold clamp",D(6)); penalty(L1,"Karwan Aziz",5000,"late",D(7)); penalty(L1,"Karwan Aziz",2500,"phone on the line",D(8))
    ck("20. several penalties recorded one by one", sql(f"SELECT count(*)||'|'||sum(amount)::int FROM {Q('\"Penalty\"')} WHERE {Q('\"workerId\"')}='{wid('Karwan Aziz')}'")=="2|7500")
    L2.goto(B+"/workers/penalties"); ck("a leader can't give a penalty to another shift (only own employees listed)", "Ahmad Kareem" not in (L2.get_by_test_id("penalty-form").inner_text() if L2.get_by_test_id("penalty-form").count() else ""))
    # 23. leaving mid-month: Hasan quits, last day 12 → if today < 12 use today
    last=min(12,int(today));
    L1.goto(B+f"/workers/{wid('Hasan Omar')}"); L1.get_by_role("button", name="Record: quit").click()
    ck("26. the explanation is required (Save stays off until it is written)", L1.get_by_role("button", name="Save departure").is_disabled())
    L1.get_by_label("Last working day").first.fill(D(last)); L1.get_by_label("Explanation").first.fill("moved to Erbil with his family"); L1.get_by_role("button", name="Save departure").click(); L1.wait_for_timeout(1500)
    ck("25. quit recorded: inactive, last day kept, waiting for the administrator", sql(f"SELECT status||'|'||{Q('\"endDate\"')} FROM {W} WHERE id='{wid('Hasan Omar')}'")==f"INACTIVE|{D(last)}" and sql(f"SELECT kind||'|'||state FROM {Q('\"WorkerDeparture\"')}")=="QUIT|WAITING")
    # 24 + 29. fired and blacklisted
    L1.goto(B+f"/workers/{wid('Ali Hasan')}"); L1.get_by_role("button", name="Record: fired").click()
    L1.get_by_label("Explanation").last.fill("stole copper from the machine room"); L1.get_by_label("Also add to the blacklist").check()
    L1.get_by_label("Blacklist reason (if added)").fill("theft"); L1.get_by_label("Blacklist details (if added)").fill("caught taking copper wire on 8th, admitted it")
    L1.get_by_role("button", name="Save departure").last.click(); L1.wait_for_timeout(1500)
    ck("24. fired recorded; 29. added to the blacklist with reason and details", sql(f"SELECT status FROM {W} WHERE id='{wid('Ali Hasan')}'")=="INACTIVE" and sql(f"SELECT reason||'|'||shift FROM {Q('\"BlacklistEntry\"')} WHERE active")=="theft|A")
    A.goto(B+"/workers/inactive"); t=A.inner_text("main")
    ck("inactive list: name, phone, last shift, date, Fired/Quit, explanation, who recorded it", all(x in t for x in ["Ali Hasan","0750 100 0003","Shift 1","Fired","stole copper","Leader One","Hasan Omar","Quit","moved to Erbil"]))
    ck("33. inactive and blacklisted at the same time", "Blacklisted" in A.get_by_test_id(f"inactive-{num('Ali Hasan')}").inner_text())
    for _ in range(2):
        b=A.get_by_role("button", name="Confirm").first
        if b.count(): b.click(); A.wait_for_timeout(1200); A.goto(B+"/workers/inactive")
    ck("the administrator confirmed both departures", sql(f"SELECT string_agg(state::text,',') FROM {Q('\"WorkerDeparture\"')}")=="APPROVED,APPROVED")
    open_att(L1,"A",D(int(today)))
    ck("27. inactive employees are not in new attendance lists", L1.get_by_test_id(f"att-{num('Ali Hasan')}").count()==0 and L1.get_by_test_id(f"att-{num('Hasan Omar')}").count()==0)
    A.goto(B+f"/workers/{wid('Hasan Omar')}"); t=A.inner_text("main")
    ck("28. an inactive employee keeps all history (attendance records, departure, salary change)", int(sql(f"SELECT count(*) FROM {R} WHERE {Q('\"workerId\"')}='{wid('Hasan Omar')}'"))>=5 and "Quit" in t and "Salary 400,000 IQD → 450,000 IQD" in t)
    L2.goto(B+"/workers/blacklist"); L3.goto(B+"/workers/blacklist")
    ck("30. shift 2 and shift 3 leaders see the same blacklist entry", "Ali Hasan" in L2.inner_text("main") and "theft" in L2.inner_text("main") and "Ali Hasan" in L3.inner_text("main"))
    t=add_worker("Ali H.","2","+964 750 100 0003", expect_match=True)
    ck("31. adding someone with a blacklisted phone shows the warning and needs review", A.get_by_test_id("matches").count()==1 and "blacklist" in A.get_by_test_id("matches").inner_text().lower() and "theft" in A.get_by_test_id("matches").inner_text() and sql(f"SELECT count(*) FROM {W} WHERE {Q('\"fullName\"')}='Ali H.'")=="0")
    L2.get_by_role("button", name="Ask to remove").click(); L2.get_by_label("Reason").fill("cleared by the police"); L2.get_by_role("button", name="Ask to remove").last.click(); L2.wait_for_timeout(1200)
    ck("32. a leader can only ask; still on the list until the administrator decides", sql(f"SELECT active::text||'|'||{Q('\"removalState\"')} FROM {Q('\"BlacklistEntry\"')}")=="true|WAITING")
    A.goto(B+"/workers/blacklist"); A.get_by_role("button", name="Approve removal").click(); A.wait_for_timeout(1200)
    ck("32. administrator approved removal; the entry stays in history", sql(f"SELECT active::text||'|'||{Q('\"removalState\"')} FROM {Q('\"BlacklistEntry\"')}")=="false|APPROVED")

    # ── Payroll (15–23, 34–36)
    AC.goto(B+f"/workers/payroll?year={yr}&month={int(mo)}"); AC.wait_for_load_state("networkidle")
    fin=lambda pg,n: pg.get_by_test_id(f"final-{num(n)}").inner_text().split("\n")[0]
    row=lambda pg,n: pg.get_by_test_id(f"pay-{num(n)}").inner_text()
    ck(f"15. one absent day + two penalties: Karwan 400,000 − 13,333.33 − 7,500 = 379,166.67 → 379,250 ({fin(AC,'Karwan Aziz')})", fin(AC,"Karwan Aziz")=="379,250")
    ck(f"16+17+21. Ahmad: 2 absences + 1 extra = 3 deduction days, 10,000 penalty → 350,000 ({fin(AC,'Ahmad Kareem')})", fin(AC,"Ahmad Kareem")=="350,000")
    r=row(AC,"Ahmad Kareem")
    ck(f"18. actual absences (2) and extra days (1) shown apart ({r!r})", re.search(r"\t2\t0\t1\t3\t", r) is not None)
    ck(f"19. approved excuse doesn't deduct: Mohammed 400,000 ({fin(AC,'Mohammed Saleh')})", fin(AC,"Mohammed Saleh")=="400,000")
    ck(f"22. different salary: 600,000 − one day 20,000 = 580,000 ({fin(AC,'Rich Salary')})", fin(AC,"Rich Salary")=="580,000")
    ck(f"23. starts on the 10th: 21 of 30 days = 280,000 ({fin(AC,'Late Starter')})", fin(AC,"Late Starter")=="280,000")
    ck(f"23. leaves on day {last}: {last} of 30 days, salary in force on the 1st (400,000) = {400000*last/30:,.0f} → rounded ({fin(AC,'Hasan Omar')})", fin(AC,"Hasan Omar")==f"{round(400000*last/30/250)*250:,}")
    ck("15. one absent day alone (Rich Salary: daily rate 20,000 deducted once)", "20,000" in row(AC,"Rich Salary"))
    ck("35. days worked: Ahmad 28 (30 − 2 absences), Mohammed 29 (excused not worked)", row(AC,"Ahmad Kareem").split("\t")[2]=="28" and row(AC,"Mohammed Saleh").split("\t")[2]=="29")
    ck("34. totals per shift and for all shifts", AC.get_by_test_id("shift-total-1").count()==1 and AC.get_by_test_id("shift-total-2").count()==1 and AC.get_by_test_id("shift-total-3").count()==1 and "IQD" in AC.get_by_test_id("total-payable").inner_text())
    ck("Not Submitted days listed for review (shifts 2 and 3 never reported)", "Not Submitted" in AC.get_by_test_id("review").inner_text() or "days Not Submitted" in AC.get_by_test_id("review").inner_text())
    ck("accountant can't change attendance (no form)", (AC.goto(B+f"/workers/attendance?shift=A&day={D(4)}") or True) and AC.get_by_role("button", name="Submit attendance").count()==0)
    # ── printing (37–44)
    def sheet(pg, s): pg.goto(B+f"/print/salary-sheet?year={yr}&month={int(mo)}&shift={s}"); pg.wait_for_load_state("networkidle"); return pg.inner_text("main")
    for i,s in enumerate("ABC"):
        t=sheet(AC,s); rows=AC.get_by_test_id("sheet-row").count()
        ck(f"{37+i}. salary sheet of shift {i+1}: title, month, shift, one row and one empty signature box per employee ({rows})", "Monthly Employee Salary Sheet" in t and f"Shift {i+1}" in t and rows>0 and AC.get_by_test_id("signature-box").count()==rows and all(x.strip()=="" for x in AC.get_by_test_id("signature-box").all_inner_texts()))
    sheet(AC,"A")
    hdr=AC.locator("thead th").all_inner_texts()
    ck(f"main table columns ({hdr})", hdr==["No.","Employee Name","Employee ID","Days Worked","Final Salary (IQD)","Employee Signature"])
    h=AC.get_by_test_id("signature-box").first.bounding_box()["height"]
    ck(f"41. signature boxes are large (≥ 75 px ≈ 2 cm; {h:.0f})", h>=75)
    t=AC.inner_text("main")
    ck("42. manager approval and accountant boxes, total and count", all(x in t for x in ["Manager approval","Approval date","Accountant","Total — "]) and "IQD" in AC.get_by_test_id("sheet-total").inner_text())
    pdfp=br.new_context().new_page(); login(pdfp,"acct",pw["acct"]); pdfp.goto(B+f"/print/salary-sheet?year={yr}&month={int(mo)}&shift=A"); pdfp.wait_for_load_state("networkidle")
    pdfp.emulate_media(media="print"); pdf=pdfp.pdf(path=f"{OUT}/salary-sheet-shift1.pdf", prefer_css_page_size=True, print_background=True)
    pages=pdf.count(b"/Type /Page")-pdf.count(b"/Type /Pages")
    ck(f"40. A4 PDF made from the print layout ({pages} page(s), {len(pdf)} bytes)", pages>=1 and b"MediaBox" in pdf)
    pdfp.context.add_cookies([{"name":"bfms_locale","value":"ar","url":B}]); pdfp.goto(B+f"/print/salary-sheet?year={yr}&month={int(mo)}&shift=A")
    ar_ok=pdfp.get_by_test_id("salary-sheet").get_attribute("dir")=="rtl" and "كشف رواتب الموظفين الشهري" in pdfp.inner_text("main") and "توقيع الموظف" in pdfp.inner_text("main")
    pdfp.emulate_media(media="print"); pdfp.pdf(path=f"{OUT}/salary-sheet-shift1-ar.pdf", prefer_css_page_size=True, print_background=True)
    pdfp.context.add_cookies([{"name":"bfms_locale","value":"tr","url":B}]); pdfp.goto(B+f"/print/salary-sheet?year={yr}&month={int(mo)}&shift=A")
    tr_ok="Aylık Çalışan Maaş Listesi" in pdfp.inner_text("main") and "Çalışan İmzası" in pdfp.inner_text("main")
    ck("43. Arabic sheet prints right-to-left; Turkish characters print", ar_ok and tr_ok)
    ck("44. printing marked nobody as paid (no money moved, payroll still draft)", sql(f"SELECT count(*) FROM {Q('\"CashEntry\"')}")=="0" and sql(f"SELECT count(*) FROM {Q('\"PayrollRun\"')}")=="0")
    # ── salaries only with the "see money" rule (owner, 31 Oct 2026)
    RP=Q('"RolePermission"'); mgr_role=sql(f"SELECT id FROM {Q('\"Role\"')} WHERE name='Manager'")
    ck("Accountant and Manager roles have the see-money rule (Safe: view)", sql(f"SELECT count(*) FROM {RP} r JOIN {Q('\"Role\"')} o ON o.id=r.{Q('\"roleId\"')} WHERE o.name IN ('Accountant','Manager') AND r.permission='cash:view'")=="2")
    sql(f"DELETE FROM {RP} WHERE {Q('\"roleId\"')}='{mgr_role}' AND permission='cash:view'")
    MG.goto(B+f"/workers/payroll?year={yr}&month={int(mo)}"); nopay="/forbidden" in MG.url
    MG.goto(B+f"/print/salary-sheet?year={yr}&month={int(mo)}&shift=A"); nosheet="/forbidden" in MG.url
    MG.goto(B+f"/workers/{wid('Ahmad Kareem')}"); nosal=MG.get_by_test_id("worker-salary").count()==0 and MG.locator("nav a[href='/workers/payroll']").count()==0
    sql(f"INSERT INTO {RP} ({Q('\"roleId\"')},permission) VALUES ('{mgr_role}','cash:view')")
    ck("payroll permission without the see-money rule: no payroll page, no salary sheet, no salary, no menu item", nopay and nosheet and nosal)
    # ── approval and finalization (45)
    AC.goto(B+f"/workers/payroll?year={yr}&month={int(mo)}"); AC.get_by_role("button", name="Submit to the manager").click(); AC.wait_for_timeout(2500)
    ck("accountant submitted: figures frozen", sql(f"SELECT state FROM {Q('\"PayrollRun\"')}")=="SUBMITTED" and int(sql(f"SELECT count(*) FROM {Q('\"PayrollLine\"')}"))>=27)
    before=sql(f"SELECT {Q('\"finalSalary\"')}::int FROM {Q('\"PayrollLine\"')} WHERE {Q('\"workerName\"')}='Ahmad Kareem'")
    open_att(L1,"A",D(4)); mark(L1,num("Ahmad Kareem"),"Absent"); submit(L1)
    ck("while submitted, attendance for that month is locked", "already submitted" in L1.inner_text("main") or "manager" in L1.inner_text("main"))
    MG.goto(B+f"/workers/payroll?year={yr}&month={int(mo)}"); MG.get_by_role("button", name="Approve payroll").click(); MG.wait_for_timeout(1500)
    ck("manager approved", sql(f"SELECT state FROM {Q('\"PayrollRun\"')}")=="APPROVED")
    A.goto(B+f"/workers/payroll?year={yr}&month={int(mo)}"); A.get_by_role("button", name="Finalize payroll").click(); A.wait_for_timeout(1500)
    A.goto(B+f"/workers/{wid('Ahmad Kareem')}"); A.get_by_role("button", name="Change salary").click(); A.get_by_label("New monthly salary (IQD)").fill("900000"); A.get_by_label("Reason").fill("test after finalize"); A.get_by_role("button", name="Save").last.click(); A.wait_for_timeout(1200)
    A.goto(B+f"/workers/payroll?year={yr}&month={int(mo)}")
    ck(f"45. finalized; a later salary change leaves the figures unchanged ({before})", sql(f"SELECT state FROM {Q('\"PayrollRun\"')}")=="FINALIZED" and fin(A,"Ahmad Kareem")=="350,000" and before=="350000")
    A.get_by_test_id(f"pay-{num('Karwan Aziz')}").get_by_role("button", name="Correct (finalized)").click()
    A.get_by_label("Final salary").fill("380000"); A.get_by_label("Reason").fill("penalty refunded by the manager"); A.get_by_role("button", name="Save").last.click(); A.wait_for_timeout(1300)
    ck("correction of a finalized line keeps the original figure", sql(f"SELECT before::text||'|'||after::text FROM {Q('\"PayrollCorrection\"')}")=='{"daysWorked": 29, "finalSalary": 379250}|{"daysWorked": 29, "finalSalary": 380000}')
    AC.goto(B+"/workers/payroll/history"); ck("payroll history lists the month as finalized", "Finalized" in AC.inner_text("main"))
    acts=set(sql(f"SELECT string_agg(DISTINCT action, ',') FROM {Q('\"AuditLog\"')}").split(","))
    ck("history records every step", {"worker.create","worker.salary","worker.transfer","worker.leader","worker.quit","worker.fired","worker.departureConfirm","attendance.submit","attendance.correct","attendance.excuseApprove","attendance.extraAsk","attendance.extraApprove","penalty.add","blacklist.add","blacklist.removeAsk","blacklist.remove","payroll.print","payroll.submit","payroll.approve","payroll.finalize","payroll.correct"}<=acts)
    L1.goto(B+"/notifications"); ck("team leader notifications carry no salary figures", "IQD" not in L1.inner_text("main"))
    # ── 51. phone layout
    P=ctx(**p.devices["iPhone 13"]); login(P,"lead1",pw["lead1"]); over=[]
    for path in ["/workers","/workers/attendance","/workers/penalties","/workers/blacklist","/workers/excuses","/workers/shifts",f"/workers/{wid('Ahmad Kareem')}"]:
        P.goto(B+path); P.wait_for_load_state("networkidle")
        if P.evaluate("document.documentElement.scrollWidth - window.innerWidth")>1: over.append(path)
    ck(f"51. phone layout fits for the team leader ({over})", not over)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
