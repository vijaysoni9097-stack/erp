import { useState } from 'react';
import { api } from '../services/api';
import '../styles/DataImport.css';

const types = [
  ['suppliers', 'Suppliers'],
  ['medicines', 'Medicines and opening stock'],
  ['customers', 'Customers / patients'],
  ['sales', 'Historical sales / invoices'],
  ['opening_balances', 'Opening customer balances'],
];

function message(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => item.msg).join('; ');
  return 'The request could not be completed. Preview or retry the same file to check its status.';
}

export default function DataImport() {
  const [kind, setKind] = useState('suppliers');
  const [file, setFile] = useState(null);
  const [payload, setPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function clearReview() {
    setPayload(null);
    setPreview(null);
    setError('');
    setNotice('');
  }

  async function downloadTemplate() {
    setBusy('template');
    setError('');
    try {
      const { data } = await api.get(`/data-import/templates/${kind}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${kind}-import-template.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy('');
    }
  }

  async function validate(event) {
    event.preventDefault();
    clearReview();
    if (!file || !file.name.toLowerCase().endsWith('.csv')) {
      setError('Choose a CSV file. Export Excel files as CSV UTF-8 first.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Choose a CSV file of 2 MB or smaller.');
      return;
    }
    setBusy('preview');
    try {
      let content;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        setError('Save the file as CSV UTF-8 and try again.');
        return;
      }
      const request = { kind, filename: file.name, content };
      const { data } = await api.post('/data-import/preview', request, { timeout: 60000 });
      setPayload(request);
      setPreview(data);
      if (data.already_imported) setNotice(`This file was already imported (${data.row_count} records). No duplicates were added.`);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy('');
    }
  }

  async function commit() {
    if (!payload || !preview?.valid || preview.already_imported) return;
    setBusy('import');
    setError('');
    try {
      const { data } = await api.post('/data-import', payload, { timeout: 60000 });
      setNotice(data.already_imported
        ? `This file was already imported (${data.imported} records). No duplicates were added.`
        : `Imported ${data.imported} records successfully. Import reference: ${data.import_id}.`);
      setPreview(current => ({ ...current, already_imported: true }));
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === 'object' && !Array.isArray(detail) && detail.errors) {
        setPreview(detail);
        setError('Validation failed. No records were imported. Correct the errors and preview again.');
      } else {
        setError(message(err));
        if (err.response?.status === 409) setPreview(null);
      }
    } finally {
      setBusy('');
    }
  }

  const columns = Object.keys(preview?.preview?.[0] || {});
  return <section className="data-import">
    <h2>Import Existing Data</h2>
    <p>Bring a new pharmacy’s records across from another software package. Import suppliers, medicines with current opening stock, and customers first. Then import historical invoices and any opening customer balances.</p>
    <p className="inline-note">Superadmin access only. Use a CSV UTF-8 file with up to 5,000 rows and 2 MB per file.</p>
    <form onSubmit={validate}>
      <fieldset disabled={Boolean(busy)}>
        <div className="field-group">
          <label htmlFor="import-kind">Data to import</label>
          <select id="import-kind" value={kind} onChange={event => { setKind(event.target.value); clearReview(); }}>
            {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <button className="secondary-button" type="button" onClick={downloadTemplate}>Download CSV Template</button>
        <p className="inline-note">Keep the template column names. Dates use YYYY-MM-DD. Prices use decimal numbers without currency symbols or commas. Leave optional cells blank.</p>
        {kind === 'medicines' && <p className="inline-note">Required: name, sku, batch_number, expiry_date, purchase_price, selling_price. Use a unique SKU for each batch. stock_quantity is the opening quantity (defaults to 0), unit defaults to number, and reorder_level defaults to 10. supplier_name must match an existing supplier.</p>}
        {kind === 'suppliers' && <p className="inline-note">Required: name. Supplier names must be unique.</p>}
        {kind === 'customers' && <p className="inline-note">Required: full_name. Indian mobile numbers without a country code use +91; include the country code for other countries. Shared family numbers are allowed for different names.</p>}
        {kind === 'sales' && <>
          <p className="inline-note">Use one row per invoice line. Required: invoice_ref, line_ref, sold_at, balance_as_of, sku, quantity, unit_price, invoice_total, outstanding_amount. Repeat invoice details on each line; keep every line of an invoice in the same file. invoice_total must equal all discounted lines plus tax_amount.</p>
          <p className="inline-note">outstanding_amount is the unpaid amount at migration cutover; enter 0 for fully paid invoices. Unpaid invoices require customer_name and customer_phone matching an imported customer. Optional initial_paid_amount and payment_method describe money collected at the original sale; leave both blank if unknown. Payments made later in the old system are retained as a balance snapshot.</p>
          <p className="inline-note">Historical sales preserve original dates and amounts without changing current stock. sold_at and balance_as_of need an ISO timestamp with a timezone, such as 2025-03-31T12:00:00+05:30. invoice_ref must be unique across migrated invoices and opening balances.</p>
        </>}
        {kind === 'opening_balances' && <>
          <p className="inline-note">Required: balance_ref, as_of, customer_name, customer_phone, amount. Use one positive outstanding balance per customer. as_of needs a timestamp with a timezone, such as 2025-03-31T12:00:00+05:30.</p>
          <p className="inline-note">Use this for debt whose original invoices are unavailable. For each customer, import either unpaid historical invoices or an opening balance. Balances appear in Credit Accounts for collection and are excluded from sales revenue. They do not change stock or send WhatsApp messages.</p>
        </>}
        <div className="field-group">
          <label htmlFor="import-file">CSV file</label>
          <input id="import-file" type="file" accept=".csv,text/csv" required onChange={event => { setFile(event.target.files?.[0] || null); clearReview(); }} />
        </div>
        <button className="secondary-button" type="submit" disabled={!file}>Validate and Preview</button>
      </fieldset>
    </form>
    {busy && <p role="status">{busy === 'import' ? 'Importing records…' : busy === 'preview' ? 'Validating file…' : 'Preparing template…'}</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {preview && !preview.already_imported && <div className="import-review">
      <h3>Review import</h3>
      <p>{preview.row_count} CSV rows found{kind === 'sales' ? `, grouped into ${preview.record_count} invoices` : ''}. {preview.valid ? 'All records passed validation.' : `${preview.error_count} row errors found. No records have been imported.`}</p>
      {preview.errors.length > 0 && <>
        <ul className="import-errors">{preview.errors.map((item, index) => <li key={index}>Row {item.row}: {item.message}</li>)}</ul>
        {preview.error_count > preview.errors.length && <p>Showing the first {preview.errors.length} errors. Correct these and validate again.</p>}
      </>}
      {columns.length > 0 && <>
        <p>Preview of the first {preview.preview.length} records:</p>
        <div className="import-table-wrap"><table>
          <thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{preview.preview.map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{row[column] ?? '—'}</td>)}</tr>)}</tbody>
        </table></div>
      </>}
      <p className="inline-note">Import adds new records. Medicine opening quantities create stock movements; historical invoices and balances leave current stock unchanged. Existing records are never overwritten. Every row must pass validation before the file can be imported.</p>
      {preview.valid && <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={commit}>Import {preview.record_count} {kind === 'sales' ? 'Invoices' : 'Records'}</button>}
    </div>}
  </section>;
}
