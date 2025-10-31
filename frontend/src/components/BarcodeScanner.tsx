import { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Box, Button, Text } from '@mantine/core';
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  isScanning: boolean;
  isLoading: boolean;
}

export function BarcodeScanner({ onScan, isScanning, isLoading }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const handleScan = (detectedCodes: IDetectedBarcode[]) => {
    if (detectedCodes && detectedCodes.length > 0 && !isPaused && !isLoading) {
      const barcode = detectedCodes[0].rawValue;
      console.log("Barcode detected:", barcode);
      onScan(barcode);
      setIsPaused(true);
    }
  };

  const handleError = (error: unknown) => {
    console.error("Scanner error:", error);
    if (error instanceof Error) {
      if (error.message.includes("NotAllowedError") || error.message.includes("Permission denied")) {
        setError("Camera access was denied. Please allow camera access in your browser settings.");
      } else if (error.message.includes("NotFoundError")) {
        setError("No camera found. Please make sure your device has a camera.");
      } else if (error.message.includes("NotReadableError")) {
        setError("Camera is in use by another application.");
      } else {
        setError("Failed to initialize scanner. Please try again.");
      }
    } else {
      setError("An unknown error occurred with the camera.");
    }
  };

  const handleNextScan = () => {
    setIsPaused(false);
    setError(null);
  };

  const handleTapToFocus = async () => {
    // Find the video element
    const videoElement = document.querySelector('video');
    if (!videoElement) return;

    const stream = videoElement.srcObject as MediaStream;
    if (!stream) return;

    const track = stream.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as any;
      
      // Check if focus mode is supported
      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as any]
        });
      }

      // Trigger manual focus if supported
      if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot' } as any]
        });
      }
    } catch (err) {
      console.log('Focus not supported or failed:', err);
    }
  };

  if (error) {
    return (
      <Box 
        style={{ 
          width: '100%', 
          height: '300px',
          backgroundColor: '#f0f0f0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          borderRadius: '8px'
        }}
      >
        <Text c="red" mb="md" ta="center">{error}</Text>
        <Button 
          onClick={() => {
            setError(null);
            setIsPaused(false);
          }}
        >
          Try Again
        </Button>
      </Box>
    );
  }

  if (!isScanning) {
    return null;
  }

  return (
    <Box 
      onClick={handleTapToFocus}
      onTouchEnd={handleTapToFocus}
      style={{ 
        width: '100%', 
        minHeight: '300px',
        backgroundColor: '#000',
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer'
      }}
    >
      <Scanner
        onScan={handleScan}
        onError={handleError}
        paused={isPaused || isLoading}
        sound={false}  // Disable beep sound
        formats={[
          'ean_13',
          'ean_8',
          'upc_a',
          'upc_e',
          'code_128',
          'code_39',
          'codabar',
          'itf',
        ]}
        components={{
          onOff: false,
          torch: true,  // Enable torch/flashlight button
          zoom: true,   // Enable zoom control
          finder: true, // Show finder overlay
        }}
        styles={{
          container: {
            width: '100%',
            minHeight: '300px',
          },
        }}
        constraints={{
          facingMode: 'environment',
          advanced: [
            { focusMode: 'continuous' },
            { focusDistance: 0.25 }  // Optimized for barcodes at ~20-30cm distance
          ]
        } as any}
        scanDelay={500}
        allowMultiple={false}
      />
      
      {isPaused && !isLoading && (
        <Box
          style={{
            position: 'absolute',
            bottom: '1.5%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          <Button 
            onClick={handleNextScan}
            variant="light"
            color="blue"
            size="md"
            style={{
              backgroundColor: 'rgba(16, 51, 82, 0.88)' // Less transparent blue
            }}
          >
            New Scan
          </Button>
        </Box>
      )}

      {!isPaused && !isLoading && (
        <Text 
          style={{ 
            position: 'absolute',
            bottom: '2.2%',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'white',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          Center barcode to scan
        </Text>
      )}
    </Box>
  );
}
