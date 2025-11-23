const {expect} = require('chai');
const hre = require('hardhat');
const {time} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Lock", function (){

    let lockedAmount = 1_000_000_000;
    let lock;
    let unlockTime;

    this.beforeEach(async function(){
        const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
        unlockTime = await time.latest() + ONE_YEAR_IN_SECS;
        lock = await hre.ethers.deployContract("Lock", [unlockTime], {
            value: lockedAmount,
        });
    });

    it("Should set the right unlockTime", async function(){
        // assert that the value is correct
        expect(await lock.unlockTime()).to.equal(unlockTime);
    });

    it("Should revert with the right error if called too soon", async function(){
        await expect(lock.withdraw()).to.be.revertedWith("You can't withdraw yet");
    });

    it("Should transfer the funds to the owner", async function(){
        await time.increaseTo(unlockTime);
        // this will throw if the transaction reverts
        await lock.withdraw();
    });

    it("Should revert with the right error if called from another account", async function(){
        const [owner, otherAccount] = await hre.ethers.getSigners();

        await time.increaseTo(unlockTime);
        
        // this will throw if the transaction reverts
        await expect(lock.connect(otherAccount).withdraw())
        .to.be.revertedWith("You aren't the owner");
    });


});