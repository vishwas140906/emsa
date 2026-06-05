document.addEventListener('DOMContentLoaded', () => {
  // Elements for Punch In Camera & Location
  const btnOpenPunchIn = document.getElementById('btnOpenPunchIn');
  const btnClosePunchIn = document.getElementById('btnClosePunchIn');
  const punchInModal = document.getElementById('punchInModal');
  const cameraStream = document.getElementById('cameraStream');
  const photoPreview = document.getElementById('photoPreview');
  const btnCapturePhoto = document.getElementById('btnCapturePhoto');
  const btnRetakePhoto = document.getElementById('btnRetakePhoto');
  const locationStatus = document.getElementById('locationStatus');
  const punchInForm = document.getElementById('punchInForm');
  
  // Hidden inputs in form
  const photoDataInput = document.getElementById('photoData');
  const latitudeInput = document.getElementById('latitude');
  const longitudeInput = document.getElementById('longitude');

  let localStream = null;

  // 1. Open Punch In Modal & Initialize Processes
  if (btnOpenPunchIn) {
    btnOpenPunchIn.addEventListener('click', async () => {
      punchInModal.classList.add('show');
      locationStatus.innerHTML = `
        <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1.5s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.1)" stroke-width="2"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--brand-primary)" stroke-width="2" stroke-linecap="round"></path>
        </svg>
        <span>Acquiring Geolocation...</span>
      `;
      
      // Fetch Geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            latitudeInput.value = lat;
            longitudeInput.value = lng;
            locationStatus.innerHTML = `
              <span class="gps-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                Location Locked: ${lat.toFixed(4)}, ${lng.toFixed(4)}
              </span>
            `;
            // Enable capture if camera is also ready
            checkReadyState();
          },
          (error) => {
            console.error('Geolocation error:', error);
            locationStatus.innerHTML = `
              <span style="color: var(--color-absent); font-size: 0.8rem; font-weight: 600;">
                ❌ Location Required to Punch In. Please enable GPS permissions in browser settings.
              </span>
            `;
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        locationStatus.innerHTML = `
          <span style="color: var(--color-absent); font-size: 0.8rem; font-weight: 600;">
            ❌ Geolocation is not supported by your browser.
          </span>
        `;
      }

      // Initialize Camera Stream
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        cameraStream.srcObject = localStream;
        cameraStream.onloadedmetadata = () => {
          checkReadyState();
        };
      } catch (err) {
        console.error('Camera access error:', err);
        locationStatus.innerHTML += `
          <div style="color: var(--color-absent); font-size: 0.8rem; font-weight: 600; margin-top: 0.5rem;">
            ❌ Camera Access Denied. Punch in requires a snapshot. Please grant camera permission.
          </div>
        `;
      }
    });
  }

  // Helper to enable capture photo button only when inputs are ready
  function checkReadyState() {
    const hasLocation = latitudeInput.value && longitudeInput.value;
    const hasCamera = cameraStream.srcObject && cameraStream.videoWidth > 0;
    
    if (hasLocation && hasCamera) {
      btnCapturePhoto.removeAttribute('disabled');
      btnCapturePhoto.style.backgroundColor = 'var(--brand-primary)';
      btnCapturePhoto.style.color = 'white';
    }
  }

  // 2. Capture Photo Action
  if (btnCapturePhoto) {
    btnCapturePhoto.addEventListener('click', () => {
      if (!localStream) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = cameraStream.videoWidth || 640;
      canvas.height = cameraStream.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      // Mirror the captured image to match user preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(cameraStream, 0, 0, canvas.width, canvas.height);
      
      const base64Data = canvas.toDataURL('image/jpeg', 0.85);
      
      // Save payload
      photoDataInput.value = base64Data;
      
      // Show Preview
      photoPreview.src = base64Data;
      photoPreview.style.display = 'block';
      cameraStream.style.display = 'none';
      
      // Toggle Buttons
      btnCapturePhoto.style.display = 'none';
      btnRetakePhoto.style.display = 'block';
      punchInForm.style.display = 'block';
    });
  }

  // 3. Retake Photo Action
  if (btnRetakePhoto) {
    btnRetakePhoto.addEventListener('click', () => {
      // Clear data
      photoDataInput.value = '';
      
      // Toggle visibility
      photoPreview.style.display = 'none';
      cameraStream.style.display = 'block';
      
      btnCapturePhoto.style.display = 'block';
      btnRetakePhoto.style.display = 'none';
      punchInForm.style.display = 'none';
    });
  }

  // 4. Close Modal & Stop Stream
  function closePunchModal() {
    punchInModal.classList.remove('show');
    
    // Stop camera stream tracks to turn off camera light
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    // Clear inputs and resets
    latitudeInput.value = '';
    longitudeInput.value = '';
    photoDataInput.value = '';
    
    cameraStream.srcObject = null;
    cameraStream.style.display = 'block';
    photoPreview.style.display = 'none';
    
    btnCapturePhoto.setAttribute('disabled', 'true');
    btnCapturePhoto.style.display = 'block';
    btnRetakePhoto.style.display = 'none';
    punchInForm.style.display = 'none';
  }

  if (btnClosePunchIn) {
    btnClosePunchIn.addEventListener('click', closePunchModal);
  }
  
  // Close modal on escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && punchInModal && punchInModal.classList.contains('show')) {
      closePunchModal();
    }
  });


  // --- PUNCH OUT TASK VERIFICATION ---
  const punchOutForm = document.getElementById('punchOutForm');
  if (punchOutForm) {
    const taskCheckboxes = document.querySelectorAll('.task-checkbox');
    const incompleteReasonBox = document.getElementById('incompleteReasonBox');
    const incompleteReasonText = document.getElementById('incomplete_reason');

    function evaluateTasksState() {
      if (taskCheckboxes.length === 0) return; // No tasks assigned
      
      let allChecked = true;
      taskCheckboxes.forEach(cb => {
        if (!cb.checked) {
          allChecked = false;
        }
      });

      if (allChecked) {
        incompleteReasonBox.style.display = 'none';
        incompleteReasonText.removeAttribute('required');
      } else {
        incompleteReasonBox.style.display = 'block';
        incompleteReasonText.setAttribute('required', 'true');
      }
    }

    // Bind event listeners to checkboxes
    taskCheckboxes.forEach(cb => {
      cb.addEventListener('change', evaluateTasksState);
    });

    // Run once on page load to configure state (in case browser auto-restored checkbox ticks)
    evaluateTasksState();
  }
});

// CSS spin keyframe inject for loading spinner
const style = document.createElement('style');
style.innerHTML = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
`;
document.head.appendChild(style);
