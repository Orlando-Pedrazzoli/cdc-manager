// 📄 src/app/api/tempo/route.ts
// Hora do servidor + previsão das próximas horas para a barra superior
// (ClockWeather). Só para utilizadores ativos da clínica. Se o fornecedor
// falhar devolve a hora na mesma, sem previsão — o relógio nunca depende dele.
import { NextResponse } from 'next/server';
import { getVerifiedSession } from '@/lib/get-verified-session';
import { CLINIC_WEATHER_POINT, type WeatherPayload } from '@/lib/weather';
import { fetchClinicWeather } from '@/lib/weather-source';

export async function GET() {
  const session = await getVerifiedSession(['admin', 'receptionist', 'doctor']);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sem permissões.' }, { status: 401 });
  }

  let slots: WeatherPayload['slots'] = [];
  try {
    slots = await fetchClinicWeather(Date.now());
  } catch (e) {
    console.error('[tempo] previsão indisponível:', e);
  }

  const body: WeatherPayload = {
    now: Date.now(),
    place: CLINIC_WEATHER_POINT.place,
    slots,
  };
  // `now` tem de ser fresco: o browser não guarda esta resposta
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
