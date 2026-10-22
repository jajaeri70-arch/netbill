import { useNavigate, useParams } from 'react-router-dom';
import InvoiceAdjustmentModal from '../components/InvoiceAdjustmentModal.jsx';

// URL lama tetap didukung; akses normal membuka popup dari daftar tagihan.
export default function InvoiceAdjustments() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <InvoiceAdjustmentModal invoiceId={id} onClose={() => navigate('/tagihan')} onDone={() => navigate('/tagihan')} />;
}