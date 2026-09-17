import { MANUAL_PDF_BASE64 } from '../manualPdfData';

export function downloadUserManualPDF() {
  try {
    // Decode base64 to binary byte array
    const byteCharacters = atob(MANUAL_PDF_BASE64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    
    // Create an explicit application/pdf Blob with proper MIME type
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'Tracker_Video_Analysis_User_Manual.pdf';
    document.body.appendChild(link);
    link.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 1000);
  } catch (err) {
    console.error('Failed to trigger manual PDF download via blob, falling back to direct link:', err);
    const fallbackLink = document.createElement('a');
    fallbackLink.href = '/Tracker_Video_Analysis_User_Manual.pdf';
    fallbackLink.download = 'Tracker_Video_Analysis_User_Manual.pdf';
    fallbackLink.target = '_blank';
    document.body.appendChild(fallbackLink);
    fallbackLink.click();
    document.body.removeChild(fallbackLink);
  }
}
