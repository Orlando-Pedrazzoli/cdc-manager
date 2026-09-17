// 📄 src/components/configuracoes/OrganizationForm.tsx
// =============================================================================
// CDC Manager — Configurações: Organização (identidade do cliente)
// -----------------------------------------------------------------------------
// Client Component. Grava e fica na página (toast + refresh), como o
// ClinicSettingsForm. Pré-visualização ao vivo do cabeçalho da sidebar
// (logo + nome + cor) para o cliente ver o resultado antes de gravar.
// =============================================================================

'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Building2 } from 'lucide-react';
import {
  updateOrganizationAction,
  type OrganizationActionState,
} from '@/actions/organization';
import type { Brand } from '@/models/Organization';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LogoUploader } from './LogoUploader';

const card = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '20px',
} as const;

const h3 = {
  margin: 0,
  fontSize: '15px',
  fontWeight: 700,
  color: '#1C2233',
} as const;

const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
};

export function OrganizationForm({ brand }: { brand: Brand }) {
  const router = useRouter();
  const [preview, setPreview] = useState({
    appName: brand.appName,
    logoUrl: brand.logoUrl ?? '',
    primaryColor: brand.primaryColor,
  });

  const [, action, pending] = useActionState<OrganizationActionState, FormData>(
    async (prev, formData) => {
      const result = await updateOrganizationAction(prev, formData);
      if (result && 'error' in result)
        toast.error(result.error, { duration: 7000 });
      if (result && 'success' in result) {
        toast.success('Organização gravada', { duration: 5000 });
        router.refresh();
      }
      return result;
    },
    undefined,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Pré-visualização: como fica o topo da navegação */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '16px 20px',
          borderRadius: '14px',
          backgroundColor: preview.primaryColor,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {preview.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.logoUrl}
              alt=''
              style={{ width: 28, height: 28, objectFit: 'contain' }}
            />
          ) : (
            <Building2 size={18} style={{ color: preview.primaryColor }} />
          )}
        </span>
        <span style={{ color: '#FFFFFF', fontSize: '15px', fontWeight: 700 }}>
          {preview.appName || 'Nome da aplicação'}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          pré-visualização
        </span>
      </div>

      {/* Upload do logo — form próprio (ficheiro), fora do form de texto */}
      <LogoUploader logoUrl={brand.logoUrl} primaryColor={brand.primaryColor} />

      {/* Campos de texto — form separado do upload (forms não se aninham) */}
      <form
        action={action}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div style={card}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <h3 style={h3}>Identidade</h3>
            <div style={row}>
              <Input
                id='org-name'
                name='name'
                label='Nome comercial'
                defaultValue={brand.name}
                required
                maxLength={120}
                help='Cabeçalho dos emails e documentos'
              />
              <Input
                id='org-app'
                name='appName'
                label='Nome da aplicação'
                defaultValue={brand.appName}
                required
                maxLength={60}
                onChange={e =>
                  setPreview(p => ({ ...p, appName: e.target.value }))
                }
                help='O que os utilizadores veem na navegação e no separador'
              />
            </div>
            <div style={row}>
              <Input
                id='org-logo'
                name='logoUrl'
                label='Logo por URL (alternativa ao upload)'
                defaultValue={brand.logoUrl ?? ''}
                placeholder='/logo.png ou https://…'
                maxLength={400}
                onChange={e =>
                  setPreview(p => ({ ...p, logoUrl: e.target.value }))
                }
                help='Preenchido automaticamente pelo upload; edite só para usar um URL próprio'
              />
              <div style={{ maxWidth: 160 }}>
                <Input
                  id='org-color'
                  name='primaryColor'
                  type='color'
                  label='Cor de marca'
                  defaultValue={brand.primaryColor}
                  onChange={e =>
                    setPreview(p => ({ ...p, primaryColor: e.target.value }))
                  }
                  style={{ height: 40, padding: 4 }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={card}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <h3 style={h3}>Dados legais e contactos</h3>
            <div style={row}>
              <Input
                id='org-legal'
                name='legalName'
                label='Denominação social'
                defaultValue={brand.legalName ?? ''}
                maxLength={160}
              />
              <Input
                id='org-nipc'
                name='nipc'
                label='NIPC'
                defaultValue={brand.nipc ?? ''}
                inputMode='numeric'
                maxLength={9}
                help='Validado com dígito de controlo'
              />
            </div>
            <Input
              id='org-address'
              name='address'
              label='Morada'
              defaultValue={brand.address ?? ''}
              maxLength={240}
            />
            <div style={row}>
              <Input
                id='org-phone'
                name='phone'
                label='Telefone'
                defaultValue={brand.phone ?? ''}
                maxLength={40}
              />
              <Input
                id='org-email'
                name='email'
                type='email'
                label='Email de contacto'
                defaultValue={brand.email ?? ''}
                maxLength={120}
              />
              <Input
                id='org-web'
                name='website'
                label='Website'
                defaultValue={brand.website ?? ''}
                placeholder='https://…'
                maxLength={160}
              />
            </div>
          </div>
        </div>

        <div style={card}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <h3 style={h3}>Emails automáticos</h3>
            <div style={row}>
              <Input
                id='org-from-name'
                name='emailFromName'
                label='Nome do remetente'
                defaultValue={brand.emailFromName ?? ''}
                placeholder={brand.name}
                maxLength={80}
              />
              <Input
                id='org-from-addr'
                name='emailFromAddress'
                type='email'
                label='Endereço do remetente'
                defaultValue={brand.emailFromAddress ?? ''}
                placeholder='noreply@…'
                maxLength={120}
                help='O domínio tem de estar verificado no Resend; vazio = EMAIL_FROM do servidor'
              />
            </div>
            <Input
              id='org-footer'
              name='emailFooter'
              label='Rodapé dos emails'
              defaultValue={brand.emailFooter ?? ''}
              placeholder={`${brand.name} · ${brand.address ?? 'morada'}`}
              maxLength={200}
            />
          </div>
        </div>

        <div style={card}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <h3 style={h3}>Consentimento RGPD</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
              Texto que o paciente lê e assina na ficha. Vazio = texto padrão
              gerado com o nome comercial, denominação social e NIPC acima.
              Preencha só se o vosso DPO/advogado tiver uma redação própria.
              Assinaturas já recolhidas mantêm o texto que assinaram.
            </p>
            <Textarea
              id='org-gdpr'
              name='gdprConsentText'
              label='Texto próprio (opcional)'
              defaultValue={brand.gdprConsentText ?? ''}
              rows={8}
              maxLength={8000}
              placeholder='Deixe vazio para usar o texto padrão'
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type='submit' disabled={pending}>
            {pending ? 'A gravar…' : 'Gravar organização'}
          </Button>
        </div>
      </form>
    </div>
  );
}
