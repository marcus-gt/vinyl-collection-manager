import { Html5QrcodeScanner, Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';
import { Box, Text, Button, Loader } from '@mantine/core';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  isScanning: boolean;
  isLoading: boolean;
}

interface CameraDevice {
  id: string;
  label: string;
}

const BarcodeScanner = ({ onScanSuccess, onScanError, isScanning, isLoading }: BarcodeScannerProps) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    console.log('Initializing scanner...');
    try {
      scannerRef.current = new Html5QrcodeScanner(
        'reader',
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          formatsToSupport: [ Html5QrcodeSupportedFormats.EAN_13 ],
          videoConstraints: {
            facingMode: { exact: "environment" },  // Force back camera
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
          }
        },
        /* verbose= */ false
      );
      console.log('Scanner created');

      scannerRef.current.render(
        (decodedText: string) => {
          onScanSuccess(decodedText);
        },
        (error: string) => {
          console.error('Scan error:', error);
          if (onScanError) onScanError(error);
        }
      );
    } catch (err) {
      console.error('Error initializing scanner:', err);
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, [onScanSuccess, onScanError]);

  useEffect(() => {
    const initializeScanner = async () => {
      if (!isScanning) return;

      if (!scannerRef.current) {
        console.log("Initializing scanner...");
        try {
          const devices = await Html5Qrcode.getCameras();
          console.log("Available cameras:", devices);
          setCameras(devices);

          if (devices && devices.length > 0) {
            // Prefer back camera if available
            const backCamera = devices.find(device => 
              device.label.toLowerCase().includes('back') || 
              device.label.toLowerCase().includes('rear')
            );
            await startScanning(backCamera?.id || devices[0].id);
          } else {
            setError("No cameras found");
          }
        } catch (err) {
          console.error("Failed to get cameras:", err);
          setError("Failed to initialize camera. Please make sure camera permissions are granted.");
        }
      }
    };

    initializeScanner();

    return () => {
      console.log("Cleaning up scanner...");
      if (scannerRef.current && isRunning) {
        scannerRef.current.clear();
        setIsRunning(false);
        setIsPaused(false);
        setError(null);
      }
    };
  }, [isScanning]);

  useEffect(() => {
    if (!isLoading && isPaused) {
      handleNextScan();
    }
  }, [isLoading]);

  const startScanning = async (cameraId: string) => {
    if (!scannerRef.current) return;

    try {
      await scannerRef.current.render(
        (decodedText: string) => {
          console.log("Barcode detected:", decodedText);
          onScanSuccess(decodedText);
          if (scannerRef.current) {
            scannerRef.current.pause(true);
            setIsPaused(true);
          }
        },
        (errorMessage: string) => {
          if (!errorMessage.includes("QR code parse error") && 
              !errorMessage.includes("No MultiFormat Readers were able to detect the code")) {
            console.log("Scanner error:", errorMessage);
          }
        }
      );
      setIsRunning(true);
      setIsPaused(false);
      console.log("Camera started");
    } catch (err) {
      console.error("Failed to start camera:", err);
      setError("Failed to start camera. Please try again.");
    }
  };

  const handleNextScan = async () => {
    if (scannerRef.current && isPaused) {
      scannerRef.current.resume();
      setIsPaused(false);
    }
  };

  return (
    <Box>
      <div id="reader"></div>
      {error && <Text color="red">{error}</Text>}
      {isLoading && <Loader />}
      {isPaused && !isLoading && (
        <Button
          onClick={handleNextScan}
          style={{ marginTop: '1rem' }}
        >
          Scan Next
        </Button>
      )}
      {!isScanning && (
        <Button
          onClick={() => {
            setError(null);
            if (scannerRef.current && isRunning) {
              scannerRef.current.clear();
              setIsRunning(false);
              setIsPaused(false);
            }
          }}
          style={{ marginTop: '1rem' }}
        >
          Stop Scanning
        </Button>
      )}
    </Box>
  );
};

export default BarcodeScanner; 
