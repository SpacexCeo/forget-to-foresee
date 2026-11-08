set -x
cd /root/w && [ -f NVIDIA-Linux-x86_64-595.104.02.run ] || wget -q https://us.download.nvidia.com/XFree86/Linux-x86_64/595.104.02/NVIDIA-Linux-x86_64-595.104.02.run
rm -rf nv && sh NVIDIA-Linux-x86_64-595.104.02.run --extract-only --target nv > /dev/null
cd nv; V=595.104.02; L=/usr/lib/x86_64-linux-gnu
for f in libEGL_nvidia.so.$V libGLX_nvidia.so.$V libnvidia-eglcore.so.$V libnvidia-glcore.so.$V libnvidia-glsi.so.$V libnvidia-tls.so.$V libnvidia-gpucomp.so.$V libnvidia-glvkspirv.so.$V libnvidia-egl-gbm.so.* libnvidia-api.so.1; do [ -e "$f" ] && cp -n $f $L/ ; done
cd $L && ln -sf libEGL_nvidia.so.$V libEGL_nvidia.so.0 && ln -sf libGLX_nvidia.so.$V libGLX_nvidia.so.0
mkdir -p /usr/share/glvnd/egl_vendor.d && cp -n /root/w/nv/10_nvidia.json /usr/share/glvnd/egl_vendor.d/ 2>/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -yq libegl1 libgl1 libglvnd0 libgles2 > /dev/null 2>&1
ldconfig
ls -la /dev/nvidia* 
echo EGL_SETUP_DONE
