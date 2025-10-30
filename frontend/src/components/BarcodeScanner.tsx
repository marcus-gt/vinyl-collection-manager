import { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Box, Button, Text, Select, Stack } from '@mantine/core';
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  isScanning: boolean;
  isLoading: boolean;
}

export function BarcodeScanner({ onScan, isScanning, isLoading }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);

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
      style={{ 
        width: '100%', 
        minHeight: '300px',
        backgroundColor: '#000',
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative'
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
          audio: false,
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
        }}
        scanDelay={500}
        allowMultiple={false}
      />
      
      {isPaused && !isLoading && (
        <Box
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          <Button 
            onClick={handleNextScan}
            variant="filled"
            color="blue"
            size="lg"
          >
            Next Scan
          </Button>
        </Box>
      )}

      {!isPaused && !isLoading && (
        <Text 
          style={{ 
            position: 'absolute',
            bottom: 10,
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
