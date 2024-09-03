import { Hex } from "@lapo/asn1js/hex.js";
import { ASN1 } from "@lapo/asn1js";
import {SES_Signature_Verify} from "./verify_signature_util";
import { decodeBase64String } from "./utils"


let reHex = /^\s*(?:[0-9A-Fa-f][0-9A-Fa-f]\s*)+$/;

/**
 * 将签字文件.data中的数据按base64读取出来，然后解析
 * @param val
 */
export const decodeSignatureStringData = function (val) {
	try {
		let hexDecode = reHex.test(val)
		let decodeValue
		if (hexDecode) {
			decodeValue = Hex.decode(val)
		} else {
			decodeValue = decodeBase64String(val)
		}
		return decode(decodeValue, 0);
	} catch (e) {
		console.log("decode err", e)
		return {};
	}
}

export const decode =  (der, offset) => {
	offset = offset || 0;
	try {
		const SES_Signature = decodeSES_Signature(der,offset);
		const type = SES_Signature.toSign.eseal.esealInfo.picture.type;
		const ofdArray = SES_Signature.toSign.eseal.esealInfo.picture.data.byte;
		return {ofdArray, 'type': (type.str || type).toLowerCase(), SES_Signature,'verifyRet': SES_Signature_Verify(SES_Signature)};
	} catch (e) {
		console.log(e)
		return {};
	}
}

const decodeUTCTime = (str: string) => {
	str = str.replace('Unrecognized time: ','');
	const UTC = str.indexOf('Z') > 0;
	str = str.replace('Z', '');
	str = str.substr(0,1)<'5'?'20'+str:'19'+str;
	return str;
}


const decodeCert = function (asn1: any, offset: any) {
	offset = offset || 0;
	try {
		const asn1Subject = asn1.sub[0].sub[0].sub[5];
		let subject = new Map();
		asn1Subject.sub.forEach(element => {
			const key = element.sub[0].sub[0].content().split('\n')[0];
			const value = element.sub[0].sub[1]?.stream.parseStringUTF(element.sub[0].sub[1].stream.pos + element.sub[0].sub[1].header, element.sub[0].sub[1].stream.pos + element.sub[0].sub[1].header + element.sub[0].sub[1].length);
			subject.set(key, value);
		});

		const asn1PublicKeyInfo = asn1.sub[0].sub[0].sub[6];
		return {
			subject,
			'commonName':subject.get("2.5.4.3"),
			'subjectPublicKeyInfo':{
				'algorithm':asn1PublicKeyInfo.sub[0]?.stream.parseOID(asn1PublicKeyInfo.sub[0].stream.pos+asn1PublicKeyInfo.sub[0].header,asn1PublicKeyInfo.sub[0].stream.pos+asn1PublicKeyInfo.sub[0].header+asn1PublicKeyInfo.sub[0].length),
				'subjectPublicKey':asn1PublicKeyInfo.sub[1]?.stream.hexDump(asn1PublicKeyInfo.sub[1].stream.pos+asn1PublicKeyInfo.sub[1].header,asn1PublicKeyInfo.sub[1].stream.pos+asn1PublicKeyInfo.sub[1].header+asn1PublicKeyInfo.sub[1].length),
			}};
	} catch (e) {
		console.log(e)
		return {};
	}
}


const Uint8ArrayToString = function (fileData) {
	let dataString = "";
	for (let i = 0; i < fileData.length; i++) {
		dataString += String.fromCharCode(fileData[i]);
	}
	return dataString
}


const decodeSES_Signature = (der, offset) => {
	offset = offset || 0;
	let asn1 = ASN1.decode(der, offset);
	var SES_Signature;
	try {
		//V1 V4分支判断
		//V1
		//Unrecognized time:
		let tempCreateDateValue1 = asn1.sub[0].sub[1].sub[0].sub[2].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[3].header
		let tempCreateDateValue2 = asn1.sub[0].sub[1].sub[0].sub[2].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[3].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[3].length
		let createDateValue
		try {
			let tempStream = asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[3]?.stream
			createDateValue = tempStream.parseTime(tempCreateDateValue1, tempCreateDateValue2)
		} catch (e) {
			createDateValue = e.message
		}
		const createDate = decodeUTCTime(createDateValue);
		let tempStream = asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[4]?.stream
		let validStartValue = tempStream.parseTime(asn1.sub[0].sub[1].sub[0].sub[2].sub[4].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[4].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].length)
		const validStart = decodeUTCTime(validStartValue);
		const validEnd = decodeUTCTime(asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[5]?.stream.parseTime(asn1.sub[0].sub[1].sub[0].sub[2].sub[5].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[5].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].length));
		const timeInfo = decodeUTCTime(asn1.sub[0]?.sub[2]?.stream.parseTime(asn1.sub[0].sub[2].stream.pos + asn1.sub[0].sub[2].header, asn1.sub[0].sub[2].stream.pos + asn1.sub[0].sub[2].header + asn1.sub[0].sub[2].length, false));
		const asn1CertList = asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[2];
		let certList = [];
		if(asn1CertList){
			asn1CertList.sub.forEach(asn1Cert => {
				certList.push(asn1Cert.stream.parseOctetString(asn1Cert.stream.pos + asn1Cert.header, asn1Cert.stream.pos + asn1Cert.header+asn1Cert.length));
			});
		}
		const asn1ExtDatas = asn1.sub[0]?.sub[1]?.sub[0]?.sub[4];
		let extDatas = [];
		if(asn1ExtDatas){
			asn1ExtDatas.sub.forEach(asn1ExtData => {
				extDatas.push({
					'extnID':asn1ExtData.sub[0]?.stream.parseOID(asn1ExtData.sub[0].stream.pos + asn1ExtData.sub[0].header, asn1ExtData.sub[0].stream.pos + asn1ExtData.sub[0].header+asn1ExtData.sub[0].length),
					'critical':asn1ExtData.sub[1]?.stream.parseInteger(asn1ExtData.sub[1].stream.pos + asn1ExtData.sub[1].header, asn1ExtData.sub[1].stream.pos + asn1ExtData.sub[1].header+asn1ExtData.sub[1].length),
					'extnValue':asn1ExtData.sub[2]?.stream.parseOctetString(asn1ExtData.sub[2].stream.pos + asn1ExtData.sub[2].header, asn1ExtData.sub[2].stream.pos + asn1ExtData.sub[2].header+asn1ExtData.sub[2].length),
				})
			});
		}
		//ASN1.decode(asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[3]);
		SES_Signature =
			{
				'realVersion':1,
				'toSignDer':asn1.sub[0]?.stream.enc.subarray(asn1.sub[0].stream.pos,asn1.sub[0].stream.pos+asn1.sub[0].header+asn1.sub[0].length),
				'toSign':{
					'version':asn1.sub[0]?.sub[0]?.stream.parseInteger(asn1.sub[0].sub[0].stream.pos + asn1.sub[0].sub[0].header, asn1.sub[0].sub[0].stream.pos + asn1.sub[0].sub[0].header + asn1.sub[0].sub[0].length),
					'eseal':{
						'esealInfo':{
							'header':{
								'ID':asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[0]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[0].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].header, asn1.sub[0].sub[1].sub[0].sub[0].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].length),
								'version':asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[1]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].length),
								'Vid':asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[2]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[0].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].header, asn1.sub[0].sub[1].sub[0].sub[0].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].length),
							},
							'esID':asn1.sub[0]?.sub[1]?.sub[0]?.sub[1]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[1].length),
							'property':{
								'type':asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[0]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[2].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].length),
								'name':asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[1]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[2].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].length),
								'certList':certList,
								'createDate':createDate,
								'validStart':validStart,
								'validEnd':validEnd,
							},
							'picture':{
								'type':asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[0]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[3].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].length),
								'data': {'hex': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[1]?.stream.parseOctetString(asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].length), byte: asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[1]?.stream.enc.subarray(asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].length)},
								'width':asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[2]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[3].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].length),
								'height':asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[3]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[3].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].length),
							},
							'extDatas':extDatas,
						},
						'signInfo':{
							'cert':decodeCert(asn1.sub[0]?.sub[1]?.sub[1]?.sub[0]),
							'signatureAlgorithm':asn1.sub[0]?.sub[1]?.sub[1]?.sub[1]?.stream.parseOID(asn1.sub[0].sub[1].sub[1].sub[1].stream.pos + asn1.sub[0].sub[1].sub[1].sub[1].header, asn1.sub[0].sub[1].sub[1].sub[1].stream.pos + asn1.sub[0].sub[1].sub[1].sub[1].header + asn1.sub[0].sub[1].sub[1].sub[1].length),
							'signData':asn1.sub[0]?.sub[1]?.sub[1]?.sub[2]?.stream.hexDump(asn1.sub[0].sub[1].sub[1].sub[2].stream.pos + asn1.sub[0].sub[1].sub[1].sub[2].header, asn1.sub[0].sub[1].sub[1].sub[2].stream.pos + asn1.sub[0].sub[1].sub[1].sub[2].header + asn1.sub[0].sub[1].sub[1].sub[2].length, false)
						},

					},
					'timeInfo':timeInfo,
					'dataHash':asn1.sub[0]?.sub[3]?.stream.hexDump(asn1.sub[0].sub[3].stream.pos + asn1.sub[0].sub[3].header, asn1.sub[0].sub[3].stream.pos + asn1.sub[0].sub[3].header + asn1.sub[0].sub[3].length, false),
					'propertyInfo':asn1.sub[0]?.sub[4]?.stream.parseStringUTF(asn1.sub[0].sub[4].stream.pos + asn1.sub[0].sub[4].header, asn1.sub[0].sub[4].stream.pos + asn1.sub[0].sub[4].header + asn1.sub[0].sub[4].length),
					'cert':decodeCert(asn1.sub[0]?.sub[5]),
					'signatureAlgorithm':asn1.sub[0]?.sub[6]?.stream.parseOID(asn1.sub[0].sub[6].stream.pos + asn1.sub[0].sub[6].header, asn1.sub[0].sub[6].stream.pos + asn1.sub[0].sub[6].header + asn1.sub[0].sub[6].length),
				},
				'signature':asn1.sub[1]?.stream.hexDump(asn1.sub[1].stream.pos + asn1.sub[1].header, asn1.sub[1].stream.pos + asn1.sub[1].header + asn1.sub[1].length, false),
			};
	} catch (e) {
		try {
			//V4
			const certListType = asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[2]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[2].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[2].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[2].length);
			const asn1CertList = asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[3];
			let certList = new Array();
			if(asn1CertList){
				asn1CertList.sub.forEach(asn1Cert => {
					certList.push(asn1Cert.stream.parseOctetString(asn1Cert.stream.pos + asn1Cert.header, asn1Cert.stream.pos + asn1Cert.header+asn1Cert.length));
				});
			}
			const asn1ExtDatas = asn1.sub[0]?.sub[1]?.sub[0]?.sub[4];
			let extDatas = new Array();
			if(asn1ExtDatas){
				asn1ExtDatas.sub.forEach(asn1ExtData => {
					extDatas.push({
						'extnID':asn1ExtData.sub[0]?.stream.parseOID(asn1ExtData.sub[0].stream.pos + asn1ExtData.sub[0].header, asn1ExtData.sub[0].stream.pos + asn1ExtData.sub[0].header+asn1ExtData.sub[0].length),
						'critical':asn1ExtData.sub[1]?.stream.parseInteger(asn1ExtData.sub[1].stream.pos + asn1ExtData.sub[1].header, asn1ExtData.sub[1].stream.pos + asn1ExtData.sub[1].header+asn1ExtData.sub[1].length),
						'extnValue':asn1ExtData.sub[2]?.stream.parseOctetString(asn1ExtData.sub[2].stream.pos + asn1ExtData.sub[2].header, asn1ExtData.sub[2].stream.pos + asn1ExtData.sub[2].header+asn1ExtData.sub[2].length),
					})
				});
			}
			SES_Signature =
				{
					'realVersion':4,
					'toSignDer':asn1.sub[0]?.stream.enc.subarray(asn1.sub[0].stream.pos,asn1.sub[0].stream.pos+asn1.sub[0].header+asn1.sub[0].length),
					'toSign':{
						'version':asn1.sub[0]?.sub[0]?.stream.parseInteger(asn1.sub[0].sub[0].stream.pos + asn1.sub[0].sub[0].header, asn1.sub[0].sub[0].stream.pos + asn1.sub[0].sub[0].header + asn1.sub[0].sub[0].length),
						'eseal':{
							'esealInfo':{
								'header':{
									'ID':asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[0]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[0].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].header, asn1.sub[0].sub[1].sub[0].sub[0].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].length),
									'version':asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[1]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].length),
									'Vid':asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[2]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[0].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].header, asn1.sub[0].sub[1].sub[0].sub[0].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].length),
								},
								'esID':asn1.sub[0]?.sub[1]?.sub[0]?.sub[1]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[1].length),
								'property':{
									'type':asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[0]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[2].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].length),
									'name':asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[1]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[2].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].length),
									'certListType':certListType,
									'certList':certList,
									'createDate':asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[4]?.stream.parseTime(asn1.sub[0].sub[1].sub[0].sub[2].sub[4].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[4].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].length),
									'validStart':asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[5]?.stream.parseTime(asn1.sub[0].sub[1].sub[0].sub[2].sub[5].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[5].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].length),
									'validEnd':asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[6]?.stream.parseTime(asn1.sub[0].sub[1].sub[0].sub[2].sub[6].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[6].header, asn1.sub[0].sub[1].sub[0].sub[2].sub[6].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[6].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[6].length),

								},
								'picture':{
									'type':asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[0]?.stream.parseStringUTF(asn1.sub[0].sub[1].sub[0].sub[3].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].length),
									'data': {'hex': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[1]?.stream.parseOctetString(asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].length), byte: asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[1]?.stream.enc.subarray(asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].length)},
									'width':asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[2]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[3].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].length),
									'height':asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[3]?.stream.parseInteger(asn1.sub[0].sub[1].sub[0].sub[3].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].header, asn1.sub[0].sub[1].sub[0].sub[3].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].length),
								},
								'extDatas':extDatas,
							},
							'cert':decodeCert(asn1.sub[0]?.sub[1]?.sub[1]),
							'signAlgID':asn1.sub[0]?.sub[1]?.sub[2]?.stream.parseOID(asn1.sub[0].sub[1].sub[2].stream.pos + asn1.sub[0].sub[1].sub[2].header, asn1.sub[0].sub[1].sub[2].stream.pos + asn1.sub[0].sub[1].sub[2].header + asn1.sub[0].sub[1].sub[2].length),
							'signedValue':asn1.sub[0]?.sub[1]?.sub[3]?.stream.hexDump(asn1.sub[0].sub[1].sub[3].stream.pos + asn1.sub[0].sub[1].sub[3].header, asn1.sub[0].sub[1].sub[3].stream.pos + asn1.sub[0].sub[1].sub[3].header + asn1.sub[0].sub[1].sub[3].length, false)
						},
						'timeInfo':asn1.sub[0]?.sub[2]?.stream.parseTime(asn1.sub[0].sub[2].stream.pos + asn1.sub[0].sub[2].header, asn1.sub[0].sub[2].stream.pos + asn1.sub[0].sub[2].header + asn1.sub[0].sub[2].length, false),
						'dataHash':asn1.sub[0]?.sub[3]?.stream.hexDump(asn1.sub[0].sub[3].stream.pos + asn1.sub[0].sub[3].header, asn1.sub[0].sub[3].stream.pos + asn1.sub[0].sub[3].header + asn1.sub[0].sub[3].length, false),
						'propertyInfo':Uint8ArrayToString(asn1.sub[0].sub[4])
					},
					'cert':decodeCert(asn1.sub[1]),
					'signatureAlgID':asn1.sub[2]?.stream.parseOID(asn1.sub[2].stream.pos + asn1.sub[2].header, asn1.sub[2].stream.pos + asn1.sub[2].header + asn1.sub[2].length),
					'signature':asn1.sub[3]?.stream.hexDump(asn1.sub[3].stream.pos + asn1.sub[3].header, asn1.sub[3].stream.pos + asn1.sub[3].header + asn1.sub[3].length, false),
					'timpStamp':asn1.sub[4]?.stream.parseTime(asn1.sub[4].stream.pos + asn1.sub[4].header, asn1.sub[4].stream.pos + asn1.sub[4].header + asn1.sub[4].length)
				};
		} catch (e) {
			console.log(e);
			SES_Signature={};
		}
	}
	return SES_Signature;
}
