set -x
export DEBIAN_FRONTEND=noninteractive
AG="apt-get -o APT::Get::AllowUnauthenticated=true install -yq"
$AG ffmpeg libvulkan1 vulkan-tools libgles2 libglvnd0 fonts-noto-core fonts-noto-cjk
# MPFB 2.0.18 (sha256 pinned in art/agents/iris_hero/README.md)
cd /root/w && wget -q -O mpfb-2.0.18.zip "https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip"
echo "c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad  mpfb-2.0.18.zip" | sha256sum -c && blender -b --command extension install-file -r user_default -e /root/w/mpfb-2.0.18.zip
# Playwright + Chromium in /root/pw
mkdir -p /root/pw && cd /root/pw && npm init -y >/dev/null && npm i -s playwright@1.49.1 && npx -y playwright@1.49.1 install --with-deps chromium
# NVIDIA user-space GL/EGL/Vulkan libraries matching the host driver
V=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
cd /root/w && wget -q https://us.download.nvidia.com/XFree86/Linux-x86_64/$V/NVIDIA-Linux-x86_64-$V.run
rm -rf nv && sh NVIDIA-Linux-x86_64-$V.run --extract-only --target nv > /dev/null
cd nv; L=/usr/lib/x86_64-linux-gnu
for f in libEGL_nvidia.so.$V libGLX_nvidia.so.$V libnvidia-eglcore.so.$V libnvidia-glcore.so.$V libnvidia-glsi.so.$V libnvidia-tls.so.$V libnvidia-gpucomp.so.$V libnvidia-glvkspirv.so.$V libnvidia-egl-gbm.so.* libnvidia-api.so.1; do [ -e "$f" ] && cp -n $f $L/ ; done
cd $L && ln -sf libEGL_nvidia.so.$V libEGL_nvidia.so.0 && ln -sf libGLX_nvidia.so.$V libGLX_nvidia.so.0
mkdir -p /usr/share/glvnd/egl_vendor.d /usr/share/vulkan/icd.d
cp -n /root/w/nv/10_nvidia.json /usr/share/glvnd/egl_vendor.d/ 2>/dev/null
[ -f /usr/share/vulkan/icd.d/nvidia_icd.json ] || sed 's/__NV_VK_ICD__/libGLX_nvidia.so.0/' /root/w/nv/nvidia_icd.json.template > /usr/share/vulkan/icd.d/nvidia_icd.json
ldconfig
echo "== checks"
vulkaninfo --summary 2>&1 | grep -E "deviceName|driverName|apiVersion" | head -4
blender -b --python-expr "import addon_utils,bpy;print('MPFB', [m.__name__ for m in addon_utils.modules() if 'mpfb' in m.__name__])" 2>&1 | grep MPFB
ffmpeg -hide_banner -version | head -1; node -e "require('/root/pw/node_modules/playwright');console.log('PW ok')"
echo SETUP2_DONE
