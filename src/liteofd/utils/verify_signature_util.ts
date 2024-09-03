import {
    sm2
} from "sm-crypto";
import rsa from "jsrsasign"

export const SES_Signature_Verify = (SES_Signature) => {
    try {
        let signAlg = SES_Signature.realVersion<4?SES_Signature.toSign.signatureAlgorithm:SES_Signature.signatureAlgID;
        signAlg = signAlg.toLowerCase();
        const msg = SES_Signature.toSignDer;
        if(signAlg.indexOf("1.2.156.10197.1.501")>=0 || signAlg.indexOf("sm2")>=0){
            let sigValueHex = SES_Signature.signature.replace(/ /g,'').replace(/\n/g,'');
            if(sigValueHex.indexOf('00')==0){
                sigValueHex = sigValueHex.substr(2,sigValueHex.length-2);
            }
            const cert = SES_Signature.realVersion<4?SES_Signature.toSign.cert:SES_Signature.cert;
            let publicKey = cert.subjectPublicKeyInfo.subjectPublicKey.replace(/ /g,'').replace(/\n/g,'');
            if(publicKey.indexOf('00')==0){
                publicKey = publicKey.substr(2,publicKey.length-2);
            }
            return sm2.doVerifySignature(msg, sigValueHex, publicKey, {
                der : true,
                hash: true,
                userId:"1234567812345678"
            });
        }else{
            let sig = new rsa.KJUR.crypto.Signature({"alg": "SHA1withRSA"});
            const cert = SES_Signature.realVersion<4?SES_Signature.toSign.cert:SES_Signature.cert;
            let sigValueHex = SES_Signature.signature.replace(/ /g,'').replace(/\n/g,'');
            if(sigValueHex.indexOf('00')==0){
                sigValueHex = sigValueHex.substr(2,sigValueHex.length-2);
            }
            sig.init(cert);
            sig.updateHex(msg);
            return sig.verify(sigValueHex);
        }
    } catch (e) {
        console.log(e)
        return false;
    }
}
