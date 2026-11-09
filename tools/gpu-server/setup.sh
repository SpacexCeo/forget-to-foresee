set -x
mkdir -p /root/logs /root/tools /root/w
export DEBIAN_FRONTEND=noninteractive
apt-get update -q && apt-get install -yq xz-utils libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libegl1 libxkbcommon0 libsm6 libice6 libglu1-mesa wget git
cd /opt && wget -q https://download.blender.org/release/Blender4.5/blender-4.5.3-linux-x64.tar.xz && tar xf blender-4.5.3-linux-x64.tar.xz && ln -sf /opt/blender-4.5.3-linux-x64/blender /usr/local/bin/blender
/opt/blender-4.5.3-linux-x64/4.5/python/bin/python3.11 -m ensurepip -q; /opt/blender-4.5.3-linux-x64/4.5/python/bin/python3.11 -m pip install -q pillow scipy
cd /opt && wget -q https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz && tar xf node-v22.11.0-linux-x64.tar.xz && ln -sf /opt/node-v22.11.0-linux-x64/bin/* /usr/local/bin/
npm i -g -s @gltf-transform/cli@4 && ln -sf /opt/node-v22.11.0-linux-x64/bin/gltf-transform /usr/local/bin/gltf-transform
cd /tmp && wget -q https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.0/KTX-Software-4.4.0-Linux-x86_64.deb && apt-get install -yq ./KTX-Software-4.4.0-Linux-x86_64.deb
git clone -q --depth 30 -b claude/laughing-thompson-dc7r09 https://github.com/SpacexCeo/forget-to-foresee.git /root/ftf
cp /root/ftf/art/tools/compress-glb.sh /root/tools/ && chmod +x /root/tools/compress-glb.sh
blender -b --python-expr "import bpy;p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='OPTIX';p.get_devices();print('DEVICES',[(d.name,d.type) for d in p.devices])" 2>&1 | grep DEVICES
toktx --version; gltf-transform --version; node --version
echo SETUP_DONE
