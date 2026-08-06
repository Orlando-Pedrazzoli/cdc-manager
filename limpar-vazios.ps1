# CDC Manager — remover os 52 ficheiros vazios do scaffolding
# (gerado do estado real do repo, commit d45f0ed) — executar na RAIZ do projeto

Remove-Item -LiteralPath "src/actions/treatments.ts"
Remove-Item -LiteralPath "src/actions/waitlist.ts"
Remove-Item -LiteralPath "src/app/(public)/marcar/confirmacao/page.tsx"
Remove-Item -LiteralPath "src/app/(public)/marcar/page.tsx"
Remove-Item -LiteralPath "src/app/admin/agenda/atribuir/page.tsx"
Remove-Item -LiteralPath "src/app/admin/auditoria/page.tsx"
Remove-Item -LiteralPath "src/app/admin/lista-espera/page.tsx"
Remove-Item -LiteralPath "src/app/admin/pacientes/[id]/documentos/page.tsx"
Remove-Item -LiteralPath "src/app/admin/pacientes/[id]/historico/page.tsx"
Remove-Item -LiteralPath "src/app/admin/tratamentos/[id]/page.tsx"
Remove-Item -LiteralPath "src/app/admin/tratamentos/page.tsx"
Remove-Item -LiteralPath "src/app/api/cron/lembretes/route.ts"
Remove-Item -LiteralPath "src/app/api/cron/recalls/route.ts"
Remove-Item -LiteralPath "src/app/api/cron/stock-alertas/route.ts"
Remove-Item -LiteralPath "src/app/api/disponibilidade/route.ts"
Remove-Item -LiteralPath "src/app/api/marcacoes/route.ts"
Remove-Item -LiteralPath "src/app/api/upload/route.ts"
Remove-Item -LiteralPath "src/app/api/webhooks/moloni/route.ts"
Remove-Item -LiteralPath "src/app/api/webhooks/whatsapp/route.ts"
Remove-Item -LiteralPath "src/app/conta/dados/page.tsx"
Remove-Item -LiteralPath "src/app/conta/exames/page.tsx"
Remove-Item -LiteralPath "src/app/conta/faturas/page.tsx"
Remove-Item -LiteralPath "src/app/conta/marcacoes/[id]/remarcar/page.tsx"
Remove-Item -LiteralPath "src/app/conta/marcacoes/page.tsx"
Remove-Item -LiteralPath "src/app/conta/plano/page.tsx"
Remove-Item -LiteralPath "src/components/agenda/AppointmentCard.tsx"
Remove-Item -LiteralPath "src/components/agenda/CalendarDayView.tsx"
Remove-Item -LiteralPath "src/components/agenda/CalendarWeekView.tsx"
Remove-Item -LiteralPath "src/components/agenda/QuickBookingCommand.tsx"
Remove-Item -LiteralPath "src/components/agenda/SlotPicker.tsx"
Remove-Item -LiteralPath "src/components/cobranca/BillingQueue.tsx"
Remove-Item -LiteralPath "src/components/dashboard/KpiCard.tsx"
Remove-Item -LiteralPath "src/components/dashboard/OccupancyChart.tsx"
Remove-Item -LiteralPath "src/components/dashboard/RevenueChart.tsx"
Remove-Item -LiteralPath "src/components/layout/PatientNav.tsx"
Remove-Item -LiteralPath "src/components/layout/Topbar.tsx"
Remove-Item -LiteralPath "src/components/marcar/BookingWizard.tsx"
Remove-Item -LiteralPath "src/components/marcar/DoctorSelect.tsx"
Remove-Item -LiteralPath "src/components/marcar/TreatmentSelect.tsx"
Remove-Item -LiteralPath "src/components/ui/Card.tsx"
Remove-Item -LiteralPath "src/components/ui/Select.tsx"
Remove-Item -LiteralPath "src/components/ui/Spinner.tsx"
Remove-Item -LiteralPath "src/components/ui/Tabs.tsx"
Remove-Item -LiteralPath "src/lib/moloni.ts"
Remove-Item -LiteralPath "src/lib/pusher-client.ts"
Remove-Item -LiteralPath "src/lib/pusher.ts"
Remove-Item -LiteralPath "src/lib/rate-limit.ts"
Remove-Item -LiteralPath "src/lib/sms.ts"
Remove-Item -LiteralPath "src/lib/utils.ts"
Remove-Item -LiteralPath "src/lib/validations/appointment.ts"
Remove-Item -LiteralPath "src/lib/whatsapp.ts"
Remove-Item -LiteralPath "src/types/index.ts"

# Remover pastas que ficarem vazias (as com conteúdo são ignoradas)
if ((Test-Path -LiteralPath "src/app/admin/pacientes/[id]/historico") -and (Get-ChildItem -LiteralPath "src/app/admin/pacientes/[id]/historico" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/pacientes/[id]/historico" }
if ((Test-Path -LiteralPath "src/app/conta/marcacoes/[id]/remarcar") -and (Get-ChildItem -LiteralPath "src/app/conta/marcacoes/[id]/remarcar" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/conta/marcacoes/[id]/remarcar" }
if ((Test-Path -LiteralPath "src/app/admin/pacientes/[id]/documentos") -and (Get-ChildItem -LiteralPath "src/app/admin/pacientes/[id]/documentos" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/pacientes/[id]/documentos" }
if ((Test-Path -LiteralPath "src/app/conta/marcacoes/[id]") -and (Get-ChildItem -LiteralPath "src/app/conta/marcacoes/[id]" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/conta/marcacoes/[id]" }
if ((Test-Path -LiteralPath "src/app/api/webhooks/whatsapp") -and (Get-ChildItem -LiteralPath "src/app/api/webhooks/whatsapp" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/webhooks/whatsapp" }
if ((Test-Path -LiteralPath "src/app/admin/pacientes/[id]") -and (Get-ChildItem -LiteralPath "src/app/admin/pacientes/[id]" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/pacientes/[id]" }
if ((Test-Path -LiteralPath "src/app/api/cron/stock-alertas") -and (Get-ChildItem -LiteralPath "src/app/api/cron/stock-alertas" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/cron/stock-alertas" }
if ((Test-Path -LiteralPath "src/app/api/cron/recalls") -and (Get-ChildItem -LiteralPath "src/app/api/cron/recalls" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/cron/recalls" }
if ((Test-Path -LiteralPath "src/app/api/webhooks/moloni") -and (Get-ChildItem -LiteralPath "src/app/api/webhooks/moloni" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/webhooks/moloni" }
if ((Test-Path -LiteralPath "src/app/api/cron/lembretes") -and (Get-ChildItem -LiteralPath "src/app/api/cron/lembretes" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/cron/lembretes" }
if ((Test-Path -LiteralPath "src/app/admin/agenda/atribuir") -and (Get-ChildItem -LiteralPath "src/app/admin/agenda/atribuir" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/agenda/atribuir" }
if ((Test-Path -LiteralPath "src/app/(public)/marcar/confirmacao") -and (Get-ChildItem -LiteralPath "src/app/(public)/marcar/confirmacao" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/(public)/marcar/confirmacao" }
if ((Test-Path -LiteralPath "src/app/admin/tratamentos/[id]") -and (Get-ChildItem -LiteralPath "src/app/admin/tratamentos/[id]" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/tratamentos/[id]" }
if ((Test-Path -LiteralPath "src/app/admin/tratamentos") -and (Get-ChildItem -LiteralPath "src/app/admin/tratamentos" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/tratamentos" }
if ((Test-Path -LiteralPath "src/app/api/cron") -and (Get-ChildItem -LiteralPath "src/app/api/cron" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/cron" }
if ((Test-Path -LiteralPath "src/app/admin/pacientes") -and (Get-ChildItem -LiteralPath "src/app/admin/pacientes" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/pacientes" }
if ((Test-Path -LiteralPath "src/app/api/disponibilidade") -and (Get-ChildItem -LiteralPath "src/app/api/disponibilidade" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/disponibilidade" }
if ((Test-Path -LiteralPath "src/app/admin/auditoria") -and (Get-ChildItem -LiteralPath "src/app/admin/auditoria" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/auditoria" }
if ((Test-Path -LiteralPath "src/app/api/upload") -and (Get-ChildItem -LiteralPath "src/app/api/upload" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/upload" }
if ((Test-Path -LiteralPath "src/app/conta/marcacoes") -and (Get-ChildItem -LiteralPath "src/app/conta/marcacoes" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/conta/marcacoes" }
if ((Test-Path -LiteralPath "src/app/conta/dados") -and (Get-ChildItem -LiteralPath "src/app/conta/dados" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/conta/dados" }
if ((Test-Path -LiteralPath "src/app/admin/lista-espera") -and (Get-ChildItem -LiteralPath "src/app/admin/lista-espera" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/lista-espera" }
if ((Test-Path -LiteralPath "src/app/api/webhooks") -and (Get-ChildItem -LiteralPath "src/app/api/webhooks" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/webhooks" }
if ((Test-Path -LiteralPath "src/app/conta/exames") -and (Get-ChildItem -LiteralPath "src/app/conta/exames" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/conta/exames" }
if ((Test-Path -LiteralPath "src/app/conta/plano") -and (Get-ChildItem -LiteralPath "src/app/conta/plano" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/conta/plano" }
if ((Test-Path -LiteralPath "src/app/conta/faturas") -and (Get-ChildItem -LiteralPath "src/app/conta/faturas" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/conta/faturas" }
if ((Test-Path -LiteralPath "src/app/admin/agenda") -and (Get-ChildItem -LiteralPath "src/app/admin/agenda" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin/agenda" }
if ((Test-Path -LiteralPath "src/app/api/marcacoes") -and (Get-ChildItem -LiteralPath "src/app/api/marcacoes" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api/marcacoes" }
if ((Test-Path -LiteralPath "src/app/(public)/marcar") -and (Get-ChildItem -LiteralPath "src/app/(public)/marcar" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/(public)/marcar" }
if ((Test-Path -LiteralPath "src/components/dashboard") -and (Get-ChildItem -LiteralPath "src/components/dashboard" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/components/dashboard" }
if ((Test-Path -LiteralPath "src/app/api") -and (Get-ChildItem -LiteralPath "src/app/api" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/api" }
if ((Test-Path -LiteralPath "src/components/marcar") -and (Get-ChildItem -LiteralPath "src/components/marcar" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/components/marcar" }
if ((Test-Path -LiteralPath "src/components/layout") -and (Get-ChildItem -LiteralPath "src/components/layout" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/components/layout" }
if ((Test-Path -LiteralPath "src/lib/validations") -and (Get-ChildItem -LiteralPath "src/lib/validations" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/lib/validations" }
if ((Test-Path -LiteralPath "src/components/ui") -and (Get-ChildItem -LiteralPath "src/components/ui" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/components/ui" }
if ((Test-Path -LiteralPath "src/app/admin") -and (Get-ChildItem -LiteralPath "src/app/admin" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/admin" }
if ((Test-Path -LiteralPath "src/app/conta") -and (Get-ChildItem -LiteralPath "src/app/conta" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/conta" }
if ((Test-Path -LiteralPath "src/components/cobranca") -and (Get-ChildItem -LiteralPath "src/components/cobranca" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/components/cobranca" }
if ((Test-Path -LiteralPath "src/app/(public)") -and (Get-ChildItem -LiteralPath "src/app/(public)" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app/(public)" }
if ((Test-Path -LiteralPath "src/components/agenda") -and (Get-ChildItem -LiteralPath "src/components/agenda" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/components/agenda" }
if ((Test-Path -LiteralPath "src/app") -and (Get-ChildItem -LiteralPath "src/app" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/app" }
if ((Test-Path -LiteralPath "src/types") -and (Get-ChildItem -LiteralPath "src/types" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/types" }
if ((Test-Path -LiteralPath "src/actions") -and (Get-ChildItem -LiteralPath "src/actions" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/actions" }
if ((Test-Path -LiteralPath "src/lib") -and (Get-ChildItem -LiteralPath "src/lib" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/lib" }
if ((Test-Path -LiteralPath "src/components") -and (Get-ChildItem -LiteralPath "src/components" -Force | Measure-Object).Count -eq 0) { Remove-Item -LiteralPath "src/components" }

# Verificação final: deve devolver 0
(Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx -File | Where-Object { $_.Length -eq 0 } | Measure-Object).Count