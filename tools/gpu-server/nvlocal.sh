# NVIDIA GL/EGL/Vulkan user-space libraries kept inside /root/w/atmo (nothing is written to system directories).
set -e
cd /root/w/atmo
[ -d nv ] || sh nv.run --extract-only --target nv > /dev/null 2>&1
V=620.70.06; mkdir -p nvlib egl_vendor icd
for f in libEGL_nvidia.so.$V libGLX_nvidia.so.$V libnvidia-eglcore.so.$V libnvidia-glcore.so.$V libnvidia-glsi.so.$V libnvidia-tls.so.$V libnvidia-gpucomp.so.$V libnvidia-glvkspirv.so.$V libGLESv2_nvidia.so.$V; do [ -e nv/$f ] && cp -n nv/$f nvlib/ && echo copied $f; done
cp -n nv/libnvidia-egl-gbm.so.* nv/libnvidia-api.so.1 nvlib/ 2>/dev/null || true
cd nvlib && ln -sf libEGL_nvidia.so.$V libEGL_nvidia.so.0 && ln -sf libGLX_nvidia.so.$V libGLX_nvidia.so.0 && ln -sf libGLESv2_nvidia.so.$V libGLESv2_nvidia.so.2 && cd ..
cp -n nv/10_nvidia.json egl_vendor/
printf '{"file_format_version":"1.0.1","ICD":{"library_path":"/root/w/atmo/nvlib/libGLX_nvidia.so.0","api_version":"1.4.357"}}' > icd/nvidia_icd.json
cat > env.sh <<'E2'
export LD_LIBRARY_PATH=/root/w/atmo/nvlib:$LD_LIBRARY_PATH
export __EGL_VENDOR_LIBRARY_DIRS=/root/w/atmo/egl_vendor
export VK_ICD_FILENAMES=/root/w/atmo/icd/nvidia_icd.json VK_DRIVER_FILES=/root/w/atmo/icd/nvidia_icd.json
export NODE_PATH=/root/w/atmo/pw/node_modules
E2
. ./env.sh && node gpucheck.cjs 2>&1 | grep -v '^$' | cut -c1-300 | head
