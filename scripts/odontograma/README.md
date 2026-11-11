# Odontograma — arte anatómica dos dentes

`svg/` contém os desenhos de origem (perfil "measured", dentição definitiva:
16 vistas laterais + 10 oclusais) do projeto
[React Advanced Odontogram](https://github.com/ZoliQua/React-Advanced-Odontogram),
© 2026 Zoltán Dul, licença **MIT** (`svg/LICENSE-react-advanced-odontogram.txt`).
Os ficheiros estão inalterados; cada um traz o aviso de autoria no próprio SVG.

A app **não** carrega estes SVG. O gerador extrai só as camadas usadas
(silhueta, brilhos, faces, cárie, selante, endodontia, espigão, coroa, faceta,
conector de ponte) para um módulo de dados:

```powershell
node scripts/odontograma/build-tooth-art.mjs
```

Saída: `src/components/clinico/odontograma/tooth-art.generated.ts` (não editar à mão).

Desenhados no CDC Manager (não vêm da arte de origem): vista incisal dos
dentes anteriores, implante, cruzes de extração/ausência e o sombreado
coroa/raiz — ver `OdontogramaAnatomico.tsx`.
