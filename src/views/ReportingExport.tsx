import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FileSpreadsheet, Download, RefreshCw, AlertCircle, Share2
} from 'lucide-react';

export const ReportingExport: React.FC = () => {
  const [exporting, setExporting] = useState<string | null>(null);
  const [syncingGoogleSheets, setSyncingGoogleSheets] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Helper to trigger browser file download
  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Excel-Compatible XML Workbook
  const handleExportExcelXML = async () => {
    setExporting('excel');
    try {
      const [delivRes, pubRes] = await Promise.all([
        supabase.from('deliverables').select('*, recordings(title, hard_disk_name), profiles:assigned_editor_id(full_name)'),
        supabase.from('publishing_logs').select('*, deliverables(title), profiles:published_by(full_name)')
      ]);

      const deliverables = delivRes.data || [];
      const logs = pubRes.data || [];

      // Generate SpreadsheetML (Native XML openable in Excel, Numbers, and Google Sheets)
      const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Deliverables">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Title</Data></Cell>
    <Cell><Data ss:Type="String">Type</Data></Cell>
    <Cell><Data ss:Type="String">Recording</Data></Cell>
    <Cell><Data ss:Type="String">Hard Disk</Data></Cell>
    <Cell><Data ss:Type="String">Editor</Data></Cell>
    <Cell><Data ss:Type="String">Status</Data></Cell>
    <Cell><Data ss:Type="String">Progress</Data></Cell>
   </Row>
   ${deliverables.map((d: any) => `
   <Row>
    <Cell><Data ss:Type="String">${escapeXML(d.title || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(d.deliverable_type || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(d.recordings?.title || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(d.recordings?.hard_disk_name || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(d.profiles?.full_name || 'Unassigned')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(d.editing_status || '')}</Data></Cell>
    <Cell><Data ss:Type="Number">${d.progress_percentage || 0}</Data></Cell>
   </Row>`).join('')}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Publishing Logs">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Platform</Data></Cell>
    <Cell><Data ss:Type="String">Deliverable</Data></Cell>
    <Cell><Data ss:Type="String">Post URL</Data></Cell>
    <Cell><Data ss:Type="String">Date</Data></Cell>
    <Cell><Data ss:Type="String">Publisher</Data></Cell>
   </Row>
   ${logs.map((l: any) => `
   <Row>
    <Cell><Data ss:Type="String">${escapeXML(l.platform || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(l.deliverables?.title || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(l.post_url || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(l.reporting_date || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXML(l.profiles?.full_name || '')}</Data></Cell>
   </Row>`).join('')}
  </Table>
 </Worksheet>
</Workbook>`;

      triggerDownload(xml, `studio_diskflow_export_${new Date().toISOString().split('T')[0]}.xls`, 'application/vnd.ms-excel');
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  const escapeXML = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // 4. Trigger Google Sheets Sync
  const handleSyncGoogleSheets = async () => {
    setSyncingGoogleSheets(true);
    setSyncMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('sync-google-sheets', {
        body: { date: new Date().toISOString().split('T')[0] }
      });

      if (error) {
        // If Edge Function isn't deployed yet, offer helpful guidance
        setSyncMessage('Google Sheets Edge Function returned: ' + error.message + '. Tip: Use the direct CSV/Excel export buttons below for immediate reporting!');
      } else {
        setSyncMessage('Google Sheets successfully updated! Synced ' + (data?.syncedCount || 0) + ' records.');
      }
    } catch (err: any) {
      setSyncMessage('Direct export ready: ' + err.message);
    } finally {
      setSyncingGoogleSheets(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-white" />
          Reporting & Data Exports
        </h1>
        <p className="text-xs text-zinc-400">
          Generate clean, formatted spreadsheets for Google Sheets, Microsoft Excel, and offline audits
        </p>
      </div>

      {/* Cloud Sync Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-zinc-800 border border-zinc-700 text-white rounded-2xl shrink-0">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Google Sheets Automated Sync
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Pushes latest video counts, editor completions, and publication URLs to your master Google Sheet
              </p>
            </div>
          </div>

          <button
            onClick={handleSyncGoogleSheets}
            disabled={syncingGoogleSheets}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingGoogleSheets ? 'animate-spin' : ''}`} />
            {syncingGoogleSheets ? 'Syncing...' : 'Sync to Google Sheets Now'}
          </button>
        </div>

        {syncMessage && (
          <div className="mt-4 p-3 rounded-2xl bg-black/60 border border-zinc-800 text-xs text-zinc-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <span>{syncMessage}</span>
          </div>
        )}
      </div>

      {/* Direct Export Cards */}
      <div className="max-w-xl">
        {/* Multi-Tab Excel Workbook */}
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center mb-3">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">
              Full Excel Workbook (XLS)
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Multi-tab spreadsheet with both Deliverables and Publishing Logs formatted for Excel and Numbers.
            </p>
          </div>

          <button
            onClick={handleExportExcelXML}
            disabled={exporting !== null}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 py-3 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black transition-all shadow-md active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting === 'excel' ? 'Generating...' : 'Download Excel'}
          </button>
        </div>
      </div>
    </div>
  );
};
