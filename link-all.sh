#!/bin/bash

GREEN="\033[1;32m"
NOCOLOR="\033[0m"

# Kit Bare
cd kits/bare/
echo -e "=> Linking ${GREEN}@aragon/kits-bare${NOCOLOR}"
npm link

echo -e "\n=> Linking ${GREEN}@aragon/kits-payroll${NOCOLOR}"
cd ../payroll
npm link @aragon/kits-bare
npm link @aragon/future-apps-payroll
npm link

echo -e "\n=> Linking ${GREEN}@aragon/kits-payroll-demo${NOCOLOR}"
cd ../payroll-demo
npm link @aragon/kits-bare
npm link @aragon/kits-payroll
npm link @aragon/future-apps-payroll
