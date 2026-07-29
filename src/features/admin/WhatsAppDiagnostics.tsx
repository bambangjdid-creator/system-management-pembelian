import React from 'react';
import WhatsAppDiagnosticsPanel from '../../components/WhatsAppDiagnosticsPanel';

type Props = {
  apiFetch: (url: string, options?: any) => Promise<Response>;
};

export default function WhatsAppDiagnostics({ apiFetch }: Props) {
  return <WhatsAppDiagnosticsPanel apiFetch={apiFetch} />;
}
