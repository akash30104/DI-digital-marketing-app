import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FileSpreadsheet, Download, RefreshCw, CheckCircle2, 
  Table, Calendar, AlertCircle, Share2, Layers
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

  // 1. Export Deliverables CSV
  const handleExportDeliverables = async () => {
    setExporting('deliverables');
    try {
      const { data, error } = await supabase
        .from('deliverables')
        .select(`
          id,
          title,
          deliverable_type,
          editing_status,
          progress_percentage,
          priority,
          deadline,
          preview_link,
          final_video_link,
          recordings (title, episode_number, hard_disk_name, folder_path),
          profiles:assigned_editor_id (full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const headers = [
        'Deliverable ID',
        'Title',
        'Type',
        'Recording Title',
        'Episode #',
        'Hard Disk',
        'Folder Path',
        'Editor',
        'Status',
        'Progress %',
        'Priority',
        'Deadline',
        'Preview Link',
        'Final Video Link'
      ];

      const rows = (data || []).map((d: any) => [
        d.id,
        `"${(d.title || '').replace(/"/g, '""')}"`,
        d.deliverable_type,
        `"${(d.recordings?.title || '').replace(/"/g, '""')}"`,
        d.recordings?.episode_number || '',
        `"${(d.recordings?.hard_disk_name || '').replace(/"/g, '""')}"`,
        `"${(d.recordings?.folder_path || '').replace(/"/g, '""')}"`,
        `"${(d.profiles?.full_name || 'Unassigned').replace(/"/g, '""')}"`,
        d.editing_status,
        d.progress_percentage,
        d.priority,
        d.deadline || '',
        d.preview_link || '',
        d.final_video_link || ''
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      triggerDownload(csvContent, `deliverables_pipeline_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  // 2. Export Publishing History CSV
  const handleExportPublishing = async () => {
    setExporting('publishing');
    try {
      const { data, error } = await supabase
        .from('publishing_logs')
        .select(`
          id,
          platform,
          publication_status,
          post_url,
          reporting_date,
          published_at,
          deliverables (title),
          profiles:published_by (full_name)
        `)
        .order('published_at', { ascending: false });

      if (error) throw error;

      const headers = [
        'Log ID',
        'Platform',
        'Deliverable Title',
        'Live Post URL',
        'Reporting Date',
        'Published At (UTC)',
        'Publisher Name'
      ];

      const rows = (data || []).map((log: any) => [
        log.id,
        log.platform,
        `"${(log.deliverables?.title || '').replace(/"/g, '""')}"`,
        log.post_url || '',
        log.reporting_date,
        log.published_at,
        `"${(log.profiles?.full_name || 'Team').replace(/"/g, '""')}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      triggerDownload(csvContent, `publishing_audit_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  // 3. Export Excel-Compatible XML Workbook
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
        <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          Reporting & Data Exports
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Generate clean, formatted spreadsheets for Google Sheets, Microsoft Excel, and offline audits
        </p>
      </div>

      {/* Cloud Sync Card */}
      <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Google Sheets Automated Sync
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pushes latest video counts, editor completions, and publication URLs to your master Google Sheet
              </p>
            </div>
          </div>

          <button
            onClick={handleSyncGoogleSheets}
            disabled={syncingGoogleSheets}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingGoogleSheets ? 'animate-spin' : ''}`} />
            {syncingGoogleSheets ? 'Syncing...' : 'Sync to Google Sheets Now'}
          </button>
        </div>

        {syncMessage && (
          <div className="mt-4 p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-emerald-500/30 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{syncMessage}</span>
          </div>
        )}
      </div>

      {/* Direct Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Deliverables Pipeline CSV */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Deliverables Pipeline CSV
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Includes editing stages, assigned editors, hard drive names, footage folder paths, and deadlines.
            </p>
          </div>

          <button
            onClick={handleExportDeliverables}
            disabled={exporting !== null}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600 text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting === 'deliverables' ? 'Generating...' : 'Download CSV'}
          </button>
        </div>

        {/* Social Publishing Audit CSV */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
              <Table className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Publishing Audit Trail CSV
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Every verified YouTube and Instagram post with verified live post URL and publisher name.
            </p>
          </div>

          <button
            onClick={handleExportPublishing}
            disabled={exporting !== null}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600 text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting === 'publishing' ? 'Generating...' : 'Download CSV'}
          </button>
        </div>

        {/* Multi-Tab Excel Workbook */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Full Excel Workbook (XLS)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Multi-tab spreadsheet with both Deliverables and Publishing Logs formatted for Excel and Numbers.
            </p>
          </div>

          <button
            onClick={handleExportExcelXML}
            disabled={exporting !== null}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting === 'excel' ? 'Generating...' : 'Download Excel'}
          </button>
        </div>
      </div>
    </div>
  );
};
