# Employee / EmployeeCompany Migration Plan

## Target Model

- `employees`
  - Employee master profile.
  - Created only on first onboarding.
  - Owns stable identity fields: `employee_no`, `user_id`, `name`, `phone`, `id_card`, bank info, merge history.
- `employee_companies`
  - Employment relation records.
  - One row per employee-company onboarding period.
  - Owns relation fields: `company_id`, `job_id`, `join_date`, `leave_date`, `settlement_mode`, `rate_plan_id`, relation status.

## Business Rules

1. First onboarding creates one `employees` master record and one `employee_companies` relation record.
2. Re-onboarding must reuse the existing `employees` master record whenever the employee is the same person.
3. "Who the employee is" must be resolved from `employees`.
4. "Which company / job / settlement mode the employee currently belongs to" must be resolved from `employee_companies`.
5. `employees.company_id` remains temporary compatibility data only and must not be treated as the primary source of truth.

## Completed In This Round

- Login binding logic now prefers non-merged `employees` master records.
- Salary self-query logic now aggregates all non-merged employee master IDs matched by `user_id` / `phone`.
- Worktime default company resolution now prefers `employee_companies`.
- Company detail and company stats now count employees from `employee_companies`.
- Employee stats now use `employee_companies` instead of `employees.company_id`.
- Web worktime employee selectors now load active employee-company relations instead of scanning only employee master rows.
- QR / onboarding duplicate detection now ignores merged employee masters and checks active company relations first.

## Remaining Follow-Up

- Finish replacing legacy `employees.company_id` fallback logic in report pages and finance summaries.
- Review salary, bonus, reimbursement, and bank transfer exports for master-vs-relation consistency.
- Add dedicated regression cases for:
  - first onboarding
  - re-onboarding
  - cross-company onboarding
  - merged employee history
  - worktime reporting after transfer / rehire
  - salary history grouped by employee master

## Recommended Release Order

1. Deploy cloud functions related to onboarding, binding, worktime, salary query, company stats, and employee stats.
2. Run relation repair scripts if production still has missing `employee_companies` rows.
3. Deploy Web updates.
4. Verify one real employee across:
   - profile
   - worktime
   - salary
   - employee list
   - company stats
