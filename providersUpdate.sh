if ! command -v pnpm &> /dev/null
then
    echo "pnpm could not be found, can't update providers"
    exit 1
fi


echo "Cloning repository ..."
git clone https://github.com/ztpn/providers.git

cd providers

echo "Installing dependencies ..."

pnpm install

echo "Building providers ..."

pnpm run build

echo "Copying providers to the correct location ..."

mkdir -p ../src/providerLib

cp -r lib/* ../src/providerLib

cd ..

echo "Cleaning up ..."

rm -rf providers